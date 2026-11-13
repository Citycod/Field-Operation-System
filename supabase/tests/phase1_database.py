#!/usr/bin/env python3
"""Real PostgreSQL constraints/triggers/RLS, in a disposable local cluster.

No remote connection or Supabase credentials are consumed. auth/storage scaffolding
below is a test substitute for Supabase infrastructure, NOT hosted Supabase proof.
Run: python3 supabase/tests/phase1_database.py
Requires PostgreSQL server binaries, psql, and permission to open a Unix socket.
"""
import concurrent.futures
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[2]
PG_BIN = Path(os.environ.get('PHASE1_PG_BIN', '/usr/lib/postgresql/18/bin'))
A = '10000000-0000-0000-0000-000000000001'
B = '10000000-0000-0000-0000-000000000002'
UA = '20000000-0000-0000-0000-000000000001'
UB = '20000000-0000-0000-0000-000000000002'
DISABLED = '20000000-0000-0000-0000-000000000003'
OUTSIDER = '20000000-0000-0000-0000-000000000004'
EMPLOYEE = '20000000-0000-0000-0000-000000000005'
FA = '30000000-0000-0000-0000-000000000001'
FB = '30000000-0000-0000-0000-000000000002'
VA = '40000000-0000-0000-0000-000000000001'
VB = '40000000-0000-0000-0000-000000000002'
ENV = os.environ.copy()


def sql(statement, check=True):
    result = subprocess.run(['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
                            input=statement, text=True, capture_output=True, env=ENV)
    if check and result.returncode:
        raise AssertionError(result.stderr)
    return result


def context(user=UA):
    return f"SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '{user}';"


def as_user(statement, user=UA):
    return sql(f'BEGIN; {context(user)} {statement}; ROLLBACK;', check=False)


def version_insert(form=FA, org=A, user=UA, number=2):
    return f"INSERT INTO public.form_versions (organization_id,form_id,version_number,status,schema_version,schema_jsonb,created_by) VALUES ('{org}','{form}',{number},'draft',1,'{{}}','{user}')"


class Phase1DatabaseTests(unittest.TestCase):
    def denied(self, statement, user=UA, error='row-level security'):
        result = as_user(statement, user)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn(error, result.stderr)

    def scalar(self, statement, expected, user=UA):
        result = as_user(statement, user)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), str(expected))

    def test_catalog_tables_rls_index_rpc_triggers_policies(self):
        self.assertEqual(sql("SELECT count(*) FROM pg_class WHERE oid IN ('public.forms'::regclass,'public.form_versions'::regclass) AND relrowsecurity").stdout.strip(), '2')
        index = sql("SELECT indexdef FROM pg_indexes WHERE indexname='one_active_draft_per_form'").stdout
        self.assertIn('UNIQUE INDEX one_active_draft_per_form', index)
        self.assertIn("WHERE (status = 'draft'::text)", index)
        self.assertEqual(sql("SELECT count(*) FROM pg_trigger WHERE tgrelid='public.form_versions'::regclass AND NOT tgisinternal").stdout.strip(), '2')
        self.assertEqual(sql("SELECT count(*) FROM pg_policies WHERE tablename IN ('forms','form_versions')").stdout.strip(), '7')
        self.assertEqual(sql("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname='publish_form_version' AND oidvectortypes(p.proargtypes)='uuid, uuid, text' AND p.pronargdefaults=1 AND NOT prosecdef AND prosrc LIKE '%auth.uid()%'").stdout.strip(), '1')
        self.assertEqual(sql("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname='publish_form_version' AND oidvectortypes(p.proargtypes)='uuid, uuid, uuid'").stdout.strip(), '0')

    def test_org_a_reads_own_form_and_version(self):
        self.scalar(f"SELECT count(*) FROM public.forms WHERE id='{FA}'", 1)
        self.scalar(f"SELECT count(*) FROM public.form_versions WHERE id='{VA}'", 1)

    def test_org_a_cannot_read_org_b_form_or_version(self):
        self.scalar(f"SELECT count(*) FROM public.forms WHERE id='{FB}'", 0)
        self.scalar(f"SELECT count(*) FROM public.form_versions WHERE id='{VB}'", 0)

    def test_org_a_cannot_insert_org_b(self):
        self.denied(f"INSERT INTO public.forms (organization_id,key,title,created_by) VALUES ('{B}','attack','Attack','{UA}')")
        self.denied(version_insert(FB, B))

    def test_org_a_cannot_update_org_b(self):
        self.scalar(f"WITH changed AS (UPDATE public.forms SET title='Attack' WHERE id='{FB}' RETURNING id) SELECT count(*) FROM changed", 0)
        self.scalar(f"WITH changed AS (UPDATE public.form_versions SET schema_jsonb='{{\"attack\":true}}' WHERE id='{VB}' RETURNING id) SELECT count(*) FROM changed", 0)

    def test_cannot_move_own_rows_to_org_b(self):
        self.denied(f"UPDATE public.forms SET organization_id='{B}' WHERE id='{FA}'")
        self.denied(f"UPDATE public.form_versions SET organization_id='{B}',form_id='{FB}' WHERE id='{VA}'")

    def test_disabled_membership_has_no_access(self):
        for table in ['forms', 'form_versions']:
            self.scalar(f'SELECT count(*) FROM public.{table}', 0, DISABLED)
        self.denied(f"INSERT INTO public.forms (organization_id,key,title,created_by) VALUES ('{A}','disabled','Disabled','{DISABLED}')", DISABLED)
        self.denied(f"SELECT public.publish_form_version('{FA}','{VA}')", DISABLED, 'not authorized')

    def test_suspended_organization_denies_all_operations(self):
        # Even with active business_admin membership, suspended organization shuts down ordinary tenant access
        try:
            sql(f"UPDATE public.organizations SET status='suspended' WHERE id='{A}'")
            for table in ['forms', 'form_versions']:
                self.scalar(f'SELECT count(*) FROM public.{table}', 0, UA)
            self.scalar(f"SELECT public.is_organization_member('{A}')", 'f', UA)
            self.scalar(f"SELECT public.get_organization_role('{A}') IS NULL", 't', UA)
            self.denied(version_insert(form=FA, org=A, user=UA), UA)
            self.denied(f"SELECT public.publish_form_version('{FA}','{VA}')", UA, 'not authorized')
        finally:
            sql(f"UPDATE public.organizations SET status='active' WHERE id='{A}'")

    def test_archived_organization_denies_all_operations(self):
        try:
            sql(f"UPDATE public.organizations SET status='archived' WHERE id='{A}'")
            for table in ['forms', 'form_versions']:
                self.scalar(f'SELECT count(*) FROM public.{table}', 0, UA)
            self.scalar(f"SELECT public.is_organization_member('{A}')", 'f', UA)
            self.scalar(f"SELECT public.get_organization_role('{A}') IS NULL", 't', UA)
            self.denied(version_insert(form=FA, org=A, user=UA), UA)
            self.denied(f"SELECT public.publish_form_version('{FA}','{VA}')", UA, 'not authorized')
        finally:
            sql(f"UPDATE public.organizations SET status='active' WHERE id='{A}'")

    def test_invited_membership_denies_all_operations(self):
        INVITED = '00000000-0000-0000-0000-000000000099'
        try:
            sql(f"INSERT INTO auth.users (id) VALUES ('{INVITED}') ON CONFLICT DO NOTHING")
            sql(f"INSERT INTO public.organization_memberships (organization_id, user_id, role_key, status) VALUES ('{A}', '{INVITED}', 'business_admin', 'invited')")
            for table in ['forms', 'form_versions']:
                self.scalar(f'SELECT count(*) FROM public.{table}', 0, INVITED)
            self.scalar(f"SELECT public.is_organization_member('{A}')", 'f', INVITED)
            self.scalar(f"SELECT public.get_organization_role('{A}') IS NULL", 't', INVITED)
            self.denied(version_insert(form=FA, org=A, user=INVITED), INVITED)
            self.denied(f"SELECT public.publish_form_version('{FA}','{VA}')", INVITED, 'not authorized')
        finally:
            sql(f"DELETE FROM public.organization_memberships WHERE user_id='{INVITED}'")
            sql(f"DELETE FROM auth.users WHERE id='{INVITED}'")

    def test_rls_helpers_anon_execution_denied(self):
        res_member = sql(f"BEGIN; SET LOCAL ROLE anon; SELECT public.is_organization_member('{A}'); ROLLBACK", check=False)
        self.assertNotEqual(res_member.returncode, 0)
        self.assertIn('permission denied', res_member.stderr)

        res_role = sql(f"BEGIN; SET LOCAL ROLE anon; SELECT public.get_organization_role('{A}'); ROLLBACK", check=False)
        self.assertNotEqual(res_role.returncode, 0)
        self.assertIn('permission denied', res_role.stderr)

    def test_unrelated_authenticated_user_has_no_access(self):
        for table in ['forms', 'form_versions']:
            self.scalar(f'SELECT count(*) FROM public.{table}', 0, OUTSIDER)
        self.denied(version_insert(user=OUTSIDER), OUTSIDER)
        self.denied(f"SELECT public.publish_form_version('{FA}','{VA}')", OUTSIDER, 'not authorized')

    def test_employee_cannot_write_or_publish(self):
        self.denied(version_insert(user=EMPLOYEE), EMPLOYEE)
        self.scalar(f"WITH changed AS (UPDATE public.forms SET title='Attack' WHERE id='{FA}' RETURNING id) SELECT count(*) FROM changed", 0, EMPLOYEE)
        self.denied(f"SELECT public.publish_form_version('{FA}','{VA}')", EMPLOYEE, 'not authorized')

    def test_cross_tenant_publish_denied(self):
        self.denied(f"SELECT public.publish_form_version('{FB}','{VB}')", error='not authorized')

    def test_publish_requires_authentication(self):
        result = sql(f"BEGIN; SELECT public.publish_form_version('{FA}','{VA}'); ROLLBACK", check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('authenticated user context', result.stderr)
        result = sql(f"BEGIN; SET LOCAL ROLE anon; SELECT public.publish_form_version('{FA}','{VA}'); ROLLBACK", check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('permission denied', result.stderr)

    def test_publish_identity_and_atomic_pointers(self):
        result = as_user(f"SELECT public.publish_form_version('{FA}','{VA}'); SELECT published_by = '{UA}' AND published_at IS NOT NULL AND status='published' FROM public.form_versions WHERE id='{VA}'; SELECT current_published_version_id='{VA}' AND current_draft_version_id IS NULL FROM public.forms WHERE id='{FA}'")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), 't\nt')

    def test_cannot_impersonate_publisher_even_in_direct_update(self):
        result = as_user(f"UPDATE public.form_versions SET status='published',published_by='{UB}',published_at='2000-01-01' WHERE id='{VA}'; SELECT published_by='{UA}' AND published_at > '2000-01-02' FROM public.form_versions WHERE id='{VA}'")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), 't')

    def test_published_and_archived_immutability_all_fields(self):
        changes = {
            'schema_jsonb': "'{\"changed\":true}'", 'schema_version': '2',
            'organization_id': f"'{B}'", 'form_id': f"'{FB}'", 'version_number': '9',
            'created_by': f"'{UB}'", 'created_at': "'2000-01-01'", 'id': 'gen_random_uuid()',
            'published_by': f"'{UB}'", 'published_at': "'2000-01-01'", 'status': "'draft'",
        }
        for archived in [False, True]:
            for column, value in changes.items():
                with self.subTest(archived=archived, field=column):
                    prefix = f"SELECT public.publish_form_version('{FA}','{VA}');"
                    if archived:
                        prefix += f"UPDATE public.form_versions SET status='archived' WHERE id='{VA}';"
                    self.denied(prefix + f"UPDATE public.form_versions SET {column}={value} WHERE id='{VA}'", error='Cannot modify')

    def test_published_and_archived_delete_denied(self):
        for archived in [False, True]:
            prefix = f"SELECT public.publish_form_version('{FA}','{VA}');"
            if archived:
                prefix += f"UPDATE public.form_versions SET status='archived' WHERE id='{VA}';"
            self.denied(prefix + f"DELETE FROM public.form_versions WHERE id='{VA}'", error='Cannot delete')

    def test_only_editorial_note_and_one_way_archive_remain_mutable(self):
        result = as_user(f"SELECT public.publish_form_version('{FA}','{VA}'); UPDATE public.form_versions SET change_note='Correction',status='archived' WHERE id='{VA}'; SELECT change_note='Correction' AND status='archived' FROM public.form_versions WHERE id='{VA}'")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), 't')

    def test_second_active_draft_rejected(self):
        self.denied(version_insert(), error='one_active_draft_per_form')

    def test_version_lifecycle_keeps_original_snapshot(self):
        result = as_user(f"SELECT public.publish_form_version('{FA}','{VA}'); {version_insert()}; SELECT public.publish_form_version('{FA}',(SELECT id FROM public.form_versions WHERE form_id='{FA}' AND status='draft')); SELECT count(*) FROM public.form_versions WHERE form_id='{FA}' AND status='published'; SELECT schema_jsonb='{{}}' AND version_number=1 FROM public.form_versions WHERE id='{VA}'")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), '2\nt')

    def test_concurrent_drafts_use_partial_unique_index(self):
        # Separate committed form and distinct version numbers isolate the partial
        # index from the (form_id, version_number) unique constraint.
        form = '30000000-0000-0000-0000-000000000003'
        sql(f"INSERT INTO public.forms (id,organization_id,key,title,created_by) VALUES ('{form}','{A}','race','Race','{UA}')")
        first = f"BEGIN; {context()} {version_insert(form, number=1)}; SELECT pg_sleep(2); COMMIT;"
        with concurrent.futures.ThreadPoolExecutor() as pool:
            winner = pool.submit(sql, first, False)
            for _ in range(100):
                active = sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event='PgSleep' AND pid <> pg_backend_pid()").stdout.strip()
                if active == '1':
                    break
                time.sleep(0.02)
            else:
                self.fail('First writer did not reach the lock-holding barrier')
            loser = sql(f"BEGIN; {context()} {version_insert(form, number=2)}; COMMIT;", False)
            self.assertEqual(winner.result().returncode, 0)
        self.assertNotEqual(loser.returncode, 0)
        self.assertIn('one_active_draft_per_form', loser.stderr)
        self.assertEqual(sql(f"SELECT count(*) FROM public.form_versions WHERE form_id='{form}' AND status='draft'").stdout.strip(), '1')

    def test_create_business_workspace_success(self):
        res = as_user("""
            SELECT public.create_business_workspace(
                'Delta Global',
                'delta-global',
                '{"business_email":"ops@delta.com","industry":"Energy","country_code":"US"}'::jsonb
            );
            SELECT status FROM public.organizations WHERE slug='delta-global';
            SELECT m.role_key || '|' || m.status 
            FROM public.organization_memberships m 
            JOIN public.organizations o ON o.id = m.organization_id 
            WHERE o.slug='delta-global' AND m.user_id = auth.uid();
            SELECT p.business_email || '|' || p.industry || '|' || p.timezone || '|' || p.currency_code 
            FROM public.organization_profiles p 
            JOIN public.organizations o ON o.id = p.organization_id 
            WHERE o.slug='delta-global';
        """, UA)
        self.assertEqual(res.returncode, 0, res.stderr)
        lines = [line.strip() for line in res.stdout.strip().splitlines() if line.strip()]
        self.assertEqual(lines[1], 'active')
        self.assertEqual(lines[2], 'business_admin|active')
        self.assertEqual(lines[3], 'ops@delta.com|Energy|UTC|USD')

    def test_create_business_workspace_anon_and_unauth_rejected(self):
        res_anon = sql("BEGIN; SET LOCAL ROLE anon; SELECT public.create_business_workspace('Anon Org', 'anon-org'); ROLLBACK;", check=False)
        self.assertNotEqual(res_anon.returncode, 0)
        self.assertIn('permission denied', res_anon.stderr)

        res_unauth = sql("BEGIN; SET LOCAL ROLE authenticated; SELECT public.create_business_workspace('No User Org', 'no-user-org'); ROLLBACK;", check=False)
        self.assertNotEqual(res_unauth.returncode, 0)
        self.assertIn('Authentication required', res_unauth.stderr)

    def test_create_business_workspace_duplicate_slug_rejected(self):
        self.denied(
            "SELECT public.create_business_workspace('Org A Duplicate', 'org-a')",
            UA,
            error='already in use'
        )

    def test_create_business_workspace_invalid_inputs_rejected(self):
        self.denied("SELECT public.create_business_workspace('X', 'valid-slug')", UA, error='at least 2 characters')
        self.denied("SELECT public.create_business_workspace('Valid Name', 'Invalid_Slug!')", UA, error='Invalid business slug format')
        self.denied("SELECT public.create_business_workspace('Valid Name', 'admin')", UA, error='reserved')

    def test_create_business_workspace_user_can_create_multiple_organizations(self):
        res = as_user("""
            SELECT public.create_business_workspace('Multi One', 'multi-one');
            SELECT public.create_business_workspace('Multi Two', 'multi-two');
            SELECT count(*) FROM public.organization_memberships m
            JOIN public.organizations o ON o.id = m.organization_id
            WHERE m.user_id = auth.uid() AND o.slug IN ('org-a', 'multi-one', 'multi-two') AND m.status = 'active';
        """, UA)
        self.assertEqual(res.returncode, 0, res.stderr)
        lines = [line.strip() for line in res.stdout.strip().splitlines() if line.strip()]
        self.assertEqual(lines[-1], '3')

    def test_organization_profile_rls_isolation(self):
        sql(f"INSERT INTO public.organization_profiles (organization_id, business_email, industry) VALUES ('{B}', 'admin@org-b.com', 'Tech') ON CONFLICT DO NOTHING")
        self.scalar(f"SELECT count(*) FROM public.organization_profiles WHERE organization_id = '{B}'", 0, UA)
        self.scalar(f"WITH changed AS (UPDATE public.organization_profiles SET business_email='hacked@org-b.com' WHERE organization_id = '{B}' RETURNING organization_id) SELECT count(*) FROM changed", 0, UA)



def main():
    if not (PG_BIN / 'initdb').exists() or not shutil.which('psql'):
        raise SystemExit('PostgreSQL binaries unavailable; set PHASE1_PG_BIN')
    with tempfile.TemporaryDirectory(prefix='field-phase1-pg-') as directory:
        data = Path(directory) / 'data'
        socket = Path(directory) / 'socket'
        socket.mkdir()
        ENV.update(PGHOST=str(socket), PGPORT='55439', PGDATABASE='postgres', PGUSER='phase1_admin')
        subprocess.run([str(PG_BIN / 'initdb'), '-D', str(data), '-U', 'phase1_admin', '--auth=trust', '--no-locale'], check=True, stdout=subprocess.DEVNULL)
        started = False
        try:
            subprocess.run([str(PG_BIN / 'pg_ctl'), '-D', str(data), '-l', str(Path(directory) / 'postgres.log'), '-o', f"-k {socket} -p 55439 -c listen_addresses=''", '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
            started = True
            sql("""
                CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
                CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS;
                CREATE ROLE service_role NOLOGIN NOSUPERUSER BYPASSRLS;
                CREATE SCHEMA auth; CREATE SCHEMA storage;
                CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
                CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
                    $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
                CREATE TABLE storage.buckets (id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
                CREATE TABLE storage.objects (id uuid,bucket_id text,name text,owner uuid);
                GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
            """)
            for migration in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
                sql(migration.read_text())
                print('Applied locally:', migration.name, flush=True)
            sql(f"""
                INSERT INTO auth.users(id) VALUES ('{UA}'),('{UB}'),('{DISABLED}'),('{OUTSIDER}'),('{EMPLOYEE}');
                INSERT INTO public.organizations(id,name,slug) VALUES ('{A}','Org A','org-a'),('{B}','Org B','org-b');
                INSERT INTO public.organization_memberships(organization_id,user_id,role_key,status) VALUES
                    ('{A}','{UA}','business_admin','active'),('{B}','{UB}','business_admin','active'),
                    ('{A}','{DISABLED}','business_admin','disabled'),('{A}','{EMPLOYEE}','employee','active');
                INSERT INTO public.forms(id,organization_id,key,title,created_by) VALUES
                    ('{FA}','{A}','a','A','{UA}'),('{FB}','{B}','b','B','{UB}');
                INSERT INTO public.form_versions(id,organization_id,form_id,version_number,status,schema_version,schema_jsonb,created_by) VALUES
                    ('{VA}','{A}','{FA}',1,'draft',1,'{{}}','{UA}'),('{VB}','{B}','{FB}',1,'draft',1,'{{}}','{UB}');
                UPDATE public.forms SET current_draft_version_id='{VA}' WHERE id='{FA}';
            """)
            print('Testing real PostgreSQL RLS with local auth/storage scaffolding; NOT a linked Supabase project.', flush=True)
            result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Phase1DatabaseTests))
            if not result.wasSuccessful():
                raise SystemExit(1)
        finally:
            if started:
                subprocess.run([str(PG_BIN / 'pg_ctl'), '-D', str(data), '-m', 'immediate', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)


if __name__ == '__main__':
    main()
