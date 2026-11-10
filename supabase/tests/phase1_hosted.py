#!/usr/bin/env python3
"""Opt-in hosted Phase 1 verification; never run against production.

Run: python3 supabase/tests/phase1_hosted.py --project-ref YOUR_DEV_REF
Reads ignored root .env; requires management SQL and Auth admin access.
User tests use real password sessions and the public API key, never admin keys.
Creates isolated UUID fixtures. Cleanup uses a transaction-local replication
role solely to remove those immutable test snapshots, then deletes test users.
Stops on the first failed assertion and never prints credentials or responses.
"""
import argparse
import json
from pathlib import Path
import secrets
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]


def load_env():
    values = {}
    for line in (ROOT / '.env').read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip().strip('\"\'')
    return values


def request(url, headers, method='GET', body=None):
    data = None if body is None else json.dumps(body).encode()
    try:
        with urlopen(Request(url, data=data, headers=headers, method=method), timeout=45) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except HTTPError as error:
        raw = error.read()
        try:
            return error.code, json.loads(raw)
        except ValueError:
            return error.code, {}


class HostedGate:
    def __init__(self, project):
        self.env = load_env()
        assert self.env['SUPABASE_PROJECT_REF'] == project, 'Project reference mismatch'
        self.base = self.env['SUPABASE_URL'].rstrip('/')
        assert self.base == f'https://{project}.supabase.co', 'Project URL mismatch'
        assert (ROOT / 'supabase/.temp/project-ref').read_text().strip() == project, 'CLI link mismatch'
        self.management = f'https://api.supabase.com/v1/projects/{project}/database/query'
        self.public_key = self.env.get('SUPABASE_PUBLISHABLE_KEY') or self.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
        self.users = {}
        self.tokens = {}
        self.ids = {key: str(uuid4()) for key in ('org_a', 'org_b', 'form_a', 'form_b', 'v1', 'vb', 'v2')}
        self.run = uuid4().hex
        self.passed = 0
        self.last_operation = 'catalog assertion (management SQL)'

    def check(self, condition, name):
        if not condition:
            raise AssertionError(name + '; ' + self.last_operation)
        self.passed += 1
        print('PASS:', name, flush=True)

    def sql(self, query):
        status, data = request(self.management, {
            'Authorization': 'Bearer ' + self.env['SUPABASE_ACCESS_TOKEN'],
            'Content-Type': 'application/json',
        }, 'POST', {'query': query, 'read_only': False})
        assert status in (200, 201), f'Management SQL HTTP {status}'
        return data

    def api(self, path, user=None, method='GET', body=None, admin=False):
        headers = {'apikey': self.env['SUPABASE_SECRET_KEY'] if admin else self.public_key,
                   'Content-Type': 'application/json', 'Prefer': 'return=representation'}
        if user:
            headers['Authorization'] = 'Bearer ' + self.tokens[user]
        status, data = request(self.base + path, headers, method, body)
        code = data.get('code', 'none') if isinstance(data, dict) else 'none'
        message = data.get('message', '') if isinstance(data, dict) else ''
        layer = ('RLS' if 'row-level security' in message else
                 'GRANT' if 'permission denied' in message else
                 'trigger/RPC/constraint' if code in ('P0001', '23503', '23505') else
                 'HTTP/API or assertion; inspect operation')
        role = 'service_role' if admin else 'authenticated/' + user if user else 'anon'
        self.last_operation = f'{method} {path.split("?")[0]}; HTTP {status}; SQLSTATE/code {code}; role {role}; level {layer}'
        return status, data

    def row(self, table, row_id, user):
        status, rows = self.api(f'/rest/v1/{table}?id=eq.{row_id}&select=*', user)
        assert status == 200 and len(rows) == 1, f'Expected visible {table} row; {self.last_operation}'
        return rows[0]

    def write(self, table, body, user=None, row_id=None, admin=False):
        path = '/rest/v1/' + table + (f'?id=eq.{row_id}' if row_id else '')
        status, data = self.api(path, user, 'PATCH' if row_id else 'POST', body, admin)
        assert status in (200, 201), f'Fixture/write {table}; {self.last_operation}'
        return data

    def catalog(self):
        rows = self.sql("""
            SELECT
              (SELECT count(*) FROM pg_class WHERE oid IN ('public.forms'::regclass,'public.form_versions'::regclass) AND relrowsecurity) AS rls_tables,
              (SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='one_active_draft_per_form') AS draft_index,
              (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.form_versions'::regclass AND conname='form_versions_org_form_fkey') AS tenant_fk,
              (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname='publish_form_version' AND pronargs=2 AND NOT prosecdef AND prosrc LIKE '%auth.uid()%') AS safe_rpc,
              (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname='publish_form_version' AND pronargs=3) AS legacy_rpc,
              (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.form_versions'::regclass AND NOT tgisinternal AND tgenabled='O') AS triggers,
              (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('forms','form_versions')) AS policies
        """)[0]
        self.check(rows['rls_tables'] == 2, 'Hosted forms and form_versions exist with RLS enabled')
        self.check('UNIQUE INDEX' in rows['draft_index'] and "WHERE (status = 'draft'::text)" in rows['draft_index'], 'Hosted one-active-draft partial unique index')
        self.check('FOREIGN KEY (organization_id, form_id) REFERENCES forms(organization_id, id)' in rows['tenant_fk'], 'Hosted composite tenant-consistency foreign key')
        self.check(rows['safe_rpc'] == 1 and rows['legacy_rpc'] == 0, 'Hosted invoker RPC derives auth.uid; caller-identity overload absent')
        self.check(rows['triggers'] == 2 and rows['policies'] == 7, 'Hosted immutability triggers and seven Form Builder RLS policies')
        versions = {row['version'] for row in self.sql('SELECT version FROM supabase_migrations.schema_migrations')}
        self.check({'20260922000000', '20260925000000', '20260925010000', '20260930000000'} <= versions, 'All four migrations recorded remotely')
        grants = self.sql("""
            SELECT grantee,table_name,privilege_type
            FROM information_schema.role_table_grants
            WHERE table_schema='public'
              AND table_name IN ('profiles','organizations','organization_memberships','forms','form_versions')
              AND grantee IN ('PUBLIC','anon','authenticated','service_role')
        """)
        actual = {(r['grantee'], r['table_name'], r['privilege_type']) for r in grants}
        expected = {('authenticated', table, 'SELECT') for table in ('profiles', 'organizations', 'organization_memberships')}
        expected |= {('authenticated', 'forms', p) for p in ('SELECT', 'INSERT', 'UPDATE')}
        expected |= {('authenticated', 'form_versions', p) for p in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')}
        expected |= {('service_role', table, p) for table in ('organizations', 'organization_memberships', 'form_versions') for p in ('SELECT', 'INSERT')}
        self.check(actual == expected, 'Exact minimum table grants; no anon/PUBLIC or TRUNCATE/TRIGGER/REFERENCES grants')

    def fixtures(self):
        for name in ('a', 'b', 'disabled', 'outsider'):
            email = f'phase1-{self.run}-{name}@example.com'
            password = secrets.token_urlsafe(32)
            status, data = self.api('/auth/v1/admin/users', method='POST', admin=True,
                                    body={'email': email, 'password': password, 'email_confirm': True})
            assert status in (200, 201) and 'id' in data, f'Auth test-user creation HTTP {status}'
            self.users[name] = data['id']
            status, data = self.api('/auth/v1/token?grant_type=password', method='POST',
                                    body={'email': email, 'password': password})
            assert status == 200 and 'access_token' in data, f'Auth test-user sign-in HTTP {status}'
            self.tokens[name] = data['access_token']
        for name in ('a', 'b'):
            self.write('organizations', {'id': self.ids['org_' + name], 'name': 'Phase 1 verification ' + name,
                                         'slug': f'phase1-{self.run}-{name}'}, admin=True)
        for name, org, status in (('a', 'a', 'active'), ('b', 'b', 'active'), ('disabled', 'a', 'disabled')):
            self.write('organization_memberships', {'organization_id': self.ids['org_' + org],
                       'user_id': self.users[name], 'role_key': 'business_admin', 'status': status}, admin=True)
        for name, version in (('a', 'v1'), ('b', 'vb')):
            self.write('forms', {'id': self.ids['form_' + name], 'organization_id': self.ids['org_' + name],
                       'key': 'phase1_' + name, 'title': 'Verification ' + name, 'created_by': self.users[name]}, name)
            self.write('form_versions', self.version(name, version, 1), name)
            self.write('forms', {'current_draft_version_id': self.ids[version]}, name, self.ids['form_' + name])
        self.check(True, 'Create Form and Draft V1 through authenticated sessions')

    def version(self, name, version, number):
        schema = {'schemaVersion': 1, 'form': {'id': self.ids['form_' + name], 'key': 'phase1_' + name,
                  'title': 'Verification', 'schemaVersion': 1}, 'header': {'columns': 1, 'sections': []},
                  'tabs': [], 'rules': [], 'workflow': None, 'listView': {'columns': []}, 'permissions': {}, 'settings': {}}
        return {'id': self.ids.get(version, str(uuid4())), 'organization_id': self.ids['org_' + name],
                'form_id': self.ids['form_' + name], 'version_number': number, 'status': 'draft',
                'schema_version': 1, 'schema_jsonb': schema, 'created_by': self.users[name]}

    def isolation(self):
        for table, own, other in (('forms', 'form_a', 'form_b'), ('form_versions', 'v1', 'vb')):
            self.check(self.row(table, self.ids[own], 'a')['id'] == self.ids[own], 'Org A reads own ' + table)
            status, data = self.api(f'/rest/v1/{table}?id=eq.{self.ids[other]}&select=id', 'a')
            self.check(status == 200 and data == [], 'Org A cannot read Org B ' + table)
            for user in ('disabled', 'outsider', None):
                ids = ','.join((self.ids[own], self.ids[other]))
                status, data = self.api(f'/rest/v1/{table}?id=in.({ids})&select=id', user)
                self.check((status == 200 and data == []) or (user is None and status in (401, 403)), f'{user or "unauthenticated"} cannot access protected {table}')
        status, data = self.api('/rest/v1/forms', 'a', 'POST', {'organization_id': self.ids['org_b'],
                                'key': 'attack', 'title': 'Attack', 'created_by': self.users['a']})
        self.check(status == 403 and data.get('code') == '42501' and 'row-level security' in data.get('message', ''), 'Org A cannot insert Org B form (RLS)')
        foreign_version = self.version('b', 'attack', 8)
        foreign_version['created_by'] = self.users['a']
        status, data = self.api('/rest/v1/form_versions', 'a', 'POST', foreign_version)
        self.check(status == 403 and data.get('code') == '42501' and 'row-level security' in data.get('message', ''), 'Org A cannot insert Org B version (RLS)')
        before = self.row('forms', self.ids['form_b'], 'b')
        status, data = self.api('/rest/v1/forms?id=eq.' + self.ids['form_b'], 'a', 'PATCH', {'title': 'Attack'})
        self.check(status == 200 and data == [] and self.row('forms', self.ids['form_b'], 'b') == before,
                   'Org A cannot update Org B form')
        before = self.row('form_versions', self.ids['vb'], 'b')
        status, data = self.api('/rest/v1/form_versions?id=eq.' + self.ids['vb'], 'a', 'PATCH', {'change_note': 'Attack'})
        self.check(status == 200 and data == [] and self.row('form_versions', self.ids['vb'], 'b') == before,
                   'Org A cannot update Org B version')
        for user in ('disabled', 'outsider'):
            status, data = self.api('/rest/v1/rpc/publish_form_version', user, 'POST',
                                   {'p_form_id': self.ids['form_a'], 'p_version_id': self.ids['v1']})
            self.check(status == 400 and data.get('code') == 'P0001', user + ' cannot publish Org A version')
        for user in ('a', 'disabled', 'outsider'):
            status, data = self.api('/rest/v1/rpc/publish_form_version', user, 'POST',
                                   {'p_form_id': self.ids['form_b'], 'p_version_id': self.ids['vb']})
            self.check(status == 400 and data.get('code') == 'P0001', user + ' cross-tenant publish rejected')
        self.check(self.row('form_versions', self.ids['vb'], 'b') == before, 'Denied publish leaves other tenant version unchanged')

    def publish(self, version):
        status, _ = self.api('/rest/v1/rpc/publish_form_version', 'a', 'POST',
                            {'p_form_id': self.ids['form_a'], 'p_version_id': self.ids[version]})
        self.check(status in (200, 204), 'Publish ' + version + ' succeeds')
        row = self.row('form_versions', self.ids[version], 'a')
        form = self.row('forms', self.ids['form_a'], 'a')
        self.check(row['status'] == 'published' and row['published_by'] == self.users['a'] and row['published_at']
                   and form['current_published_version_id'] == self.ids[version] and form['current_draft_version_id'] is None,
                   'Atomic pointers and authenticated publisher for ' + version)
        return row

    def lifecycle(self):
        schema = self.version('a', 'v1', 1)['schema_jsonb']
        schema['form']['title'] = 'Saved draft'
        self.write('form_versions', {'schema_jsonb': schema}, 'a', self.ids['v1'])
        self.check(self.row('form_versions', self.ids['v1'], 'a')['schema_jsonb'] == schema, 'Save Draft V1 succeeds')
        status, data = self.api('/rest/v1/rpc/publish_form_version', 'a', 'POST',
                                {'p_form_id': self.ids['form_a'], 'p_version_id': self.ids['v1'], 'p_user_id': self.users['b']})
        self.check(status == 404 and data.get('code') == 'PGRST202', 'RPC cannot accept impersonated p_user_id')
        original = self.publish('v1')
        changes = {'schema_jsonb': {}, 'schema_version': 2, 'organization_id': self.ids['org_b'],
                   'form_id': self.ids['form_b'], 'version_number': 9, 'created_by': self.users['b'],
                   'created_at': '2000-01-01T00:00:00Z', 'published_by': self.users['b'],
                   'published_at': '2000-01-01T00:00:00Z', 'status': 'draft'}
        for field, value in changes.items():
            status, data = self.api('/rest/v1/form_versions?id=eq.' + self.ids['v1'], 'a', 'PATCH', {field: value})
            self.check(status == 400 and data.get('code') == 'P0001', 'Published immutable: ' + field)
        status, data = self.api('/rest/v1/form_versions?id=eq.' + self.ids['v1'], 'a', 'DELETE')
        self.check(status == 400 and data.get('code') == 'P0001', 'Ordinary Published delete rejected')
        mismatch = self.version('a', 'mismatch', 9)
        mismatch['organization_id'] = self.ids['org_b']
        status, data = self.api('/rest/v1/form_versions', method='POST', body=mismatch, admin=True)
        self.check(status == 409 and data.get('code') == '23503' and 'form_versions_org_form_fkey' in data.get('message', ''), 'Composite tenant FK rejects mismatched organization/form')
        self.write('form_versions', self.version('a', 'v2', 2), 'a')
        self.write('forms', {'current_draft_version_id': self.ids['v2']}, 'a', self.ids['form_a'])
        self.check(True, 'Create Draft V2 succeeds')
        status, data = self.api('/rest/v1/form_versions', 'a', 'POST', self.version('a', 'duplicate', 3))
        self.check(status == 409 and data.get('code') == '23505' and 'one_active_draft_per_form' in data.get('message', ''), 'Second active Draft rejected by partial unique index')
        self.publish('v2')
        self.check(self.row('form_versions', self.ids['v1'], 'a') == original, 'Published V1 remains entirely unchanged after publishing V2')
        # Direct status updates must not provide an alternate audit-identity path.
        self.write('form_versions', {'status': 'published', 'published_by': self.users['a'],
                   'published_at': '2000-01-01T00:00:00Z'}, 'b', self.ids['vb'])
        published_b = self.row('form_versions', self.ids['vb'], 'b')
        self.check(published_b['published_by'] == self.users['b'] and
                   not published_b['published_at'].startswith('2000-01-01'),
                   'Direct status update cannot spoof publisher or publication time')

    def cleanup(self):
        # These UUIDs are generated by this process, never supplied by callers.
        # No ALTER TABLE / globally disabled triggers; scope is one transaction.
        forms = ','.join("'" + self.ids[key] + "'" for key in ('form_a', 'form_b'))
        orgs = ','.join("'" + self.ids[key] + "'" for key in ('org_a', 'org_b'))
        self.sql(f"""BEGIN; SET LOCAL session_replication_role = replica;
          DELETE FROM public.form_versions WHERE form_id IN ({forms});
          DELETE FROM public.forms WHERE id IN ({forms});
          DELETE FROM public.organization_memberships WHERE organization_id IN ({orgs});
          DELETE FROM public.organizations WHERE id IN ({orgs}); COMMIT;""")
        for user_id in self.users.values():
            status, _ = self.api('/auth/v1/admin/users/' + user_id, method='DELETE', admin=True)
            assert status in (200, 204), f'Test-user cleanup HTTP {status}'
        print('Fixture cleanup complete (administrative; not ordinary deletion)', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project-ref', required=True)
    gate = HostedGate(parser.parse_args().project_ref)
    gate.catalog()
    try:
        gate.fixtures()
        gate.isolation()
        gate.lifecycle()
    finally:
        gate.cleanup()
    print(f'HOSTED PASS: {gate.passed} checks', flush=True)


if __name__ == '__main__':
    try:
        main()
    except AssertionError as error:
        print('HOSTED FAILED:', str(error), file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        # Network/library exceptions may contain URLs or response material.
        print('HOSTED BLOCKED:', type(error).__name__, file=sys.stderr)
        sys.exit(1)
