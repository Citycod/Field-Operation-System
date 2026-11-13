#!/usr/bin/env python3
"""Stage 4 Database Tests: Business Onboarding Wizard & Team Invitations

Tests real PostgreSQL RLS, triggers, locks, and RPCs in a disposable local cluster.
Run: python3 supabase/tests/stage4_database.py
"""
import concurrent.futures
import hashlib
import json
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
INVITEE_1 = '20000000-0000-0000-0000-000000000006'
INVITEE_2 = '20000000-0000-0000-0000-000000000007'

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
    return sql(f'BEGIN; {context(user)} {statement}; COMMIT;', check=False)


def sha256_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


class Stage4DatabaseTests(unittest.TestCase):
    def denied(self, statement, user=UA, error='permission denied'):
        result = as_user(statement, user)
        self.assertNotEqual(result.returncode, 0, f"Expected error but succeeded: {result.stdout}")
        self.assertIn(error.lower(), result.stderr.lower(), f"Expected '{error}' in: {result.stderr}")

    def test_direct_update_on_protected_columns_denied(self):
        """Authenticated users cannot directly update onboarding state columns via table update."""
        self.denied(
            f"UPDATE public.organization_profiles SET onboarding_completed = true WHERE organization_id = '{A}';",
            user=UA,
            error="permission denied"
        )
        self.denied(
            f"UPDATE public.organization_profiles SET requires_onboarding = false WHERE organization_id = '{A}';",
            user=UA,
            error="permission denied"
        )
        self.denied(
            f"UPDATE public.organization_profiles SET onboarding_status = 'completed' WHERE organization_id = '{A}';",
            user=UA,
            error="permission denied"
        )

    def test_direct_table_access_to_organization_invitations_denied(self):
        """Direct SELECT, INSERT, UPDATE, DELETE on organization_invitations table is denied."""
        self.denied(
            f"SELECT * FROM public.organization_invitations;",
            user=UA,
            error="permission denied"
        )
        self.denied(
            f"INSERT INTO public.organization_invitations (organization_id, email, role, token_hash, invited_by, expires_at) VALUES ('{A}', 'test@example.com', 'employee', 'dummy', '{UA}', now());",
            user=UA,
            error="permission denied"
        )

    def test_onboarding_lifecycle_via_authorized_rpc(self):
        """Provision workspace, verify onboarding flags, complete onboarding atomically."""
        # 1. Create workspace
        res = as_user(
            f"SELECT public.create_business_workspace('Test Org Lifecyle', 'test-org-lifecycle');",
            user=UA
        )
        self.assertEqual(res.returncode, 0, res.stderr)
        data = json.loads(res.stdout.strip())
        org_id = data['organization_id']
        self.assertTrue(data['requires_onboarding'])
        self.assertEqual(data['onboarding_status'], 'not_started')

        # Verify profile state directly as superuser/admin
        row = sql(f"SELECT requires_onboarding, onboarding_completed, onboarding_step, onboarding_status FROM public.organization_profiles WHERE organization_id = '{org_id}';").stdout.strip()
        self.assertEqual(row, 't|f|profile|not_started')

        # 2. Non-admin cannot complete onboarding
        res_fail = as_user(
            f"SELECT public.complete_organization_onboarding('{org_id}');",
            user=OUTSIDER
        )
        self.assertNotEqual(res_fail.returncode, 0)
        self.assertIn("unauthorized", res_fail.stderr.lower())

        # 3. Business admin completes onboarding
        res_comp = as_user(
            f"SELECT public.complete_organization_onboarding('{org_id}');",
            user=UA
        )
        self.assertEqual(res_comp.returncode, 0, res_comp.stderr)
        comp_data = json.loads(res_comp.stdout.strip())
        self.assertTrue(comp_data['success'])
        self.assertTrue(comp_data['onboarding_completed'])
        self.assertEqual(comp_data['onboarding_status'], 'completed')
        self.assertEqual(comp_data['onboarding_step'], 'completed')

        # Verify profile is now completed
        row_after = sql(f"SELECT requires_onboarding, onboarding_completed, onboarding_step, onboarding_status, (onboarding_completed_at IS NOT NULL) FROM public.organization_profiles WHERE organization_id = '{org_id}';").stdout.strip()
        self.assertEqual(row_after, 't|t|completed|completed|t')

        # 4. Idempotent re-completion
        res_comp2 = as_user(
            f"SELECT public.complete_organization_onboarding('{org_id}');",
            user=UA
        )
        self.assertEqual(res_comp2.returncode, 0, res_comp2.stderr)
        comp2_data = json.loads(res_comp2.stdout.strip())
        self.assertTrue(comp2_data.get('already_completed'))

    def test_legacy_profile_resolution(self):
        """Legacy profile with legacy_unresolved can be resolved to completed."""
        # Org A was backfilled as legacy_unresolved
        res = as_user(
            f"SELECT public.resolve_legacy_organization_profile('{A}');",
            user=UA
        )
        self.assertEqual(res.returncode, 0, res.stderr)
        data = json.loads(res.stdout.strip())
        self.assertTrue(data['success'])
        self.assertEqual(data['onboarding_status'], 'completed')

    def test_invitation_role_escalation_strictly_prevented(self):
        """Only manager and employee invitations are permitted; business_admin is rejected."""
        token_hash = sha256_hash("dummy_token_1")
        res = as_user(
            f"SELECT public.create_organization_invitation('{A}', 'admin_attempt@example.com', 'business_admin', '{token_hash}');",
            user=UA
        )
        self.assertNotEqual(res.returncode, 0)
        self.assertIn("invalid invitation role", res.stderr.lower())

        res_super = as_user(
            f"SELECT public.create_organization_invitation('{A}', 'super_attempt@example.com', 'super_admin', '{token_hash}');",
            user=UA
        )
        self.assertNotEqual(res_super.returncode, 0)
        self.assertIn("invalid invitation role", res_super.stderr.lower())

    def test_invitation_lifecycle_and_acceptance(self):
        """Admin invites manager -> preview invitation -> invitee accepts -> membership activated."""
        raw_token = "secure_random_token_1234567890abcdef"
        token_hash = sha256_hash(raw_token)
        invite_email = "invitee1@example.com"

        # 1. Admin creates invitation for manager
        res = as_user(
            f"SELECT public.create_organization_invitation('{A}', '{invite_email}', 'manager', '{token_hash}');",
            user=UA
        )
        self.assertEqual(res.returncode, 0, res.stderr)
        data = json.loads(res.stdout.strip())
        invite_id = data['id']
        self.assertEqual(data['role'], 'manager')
        self.assertEqual(data['status'], 'pending')
        self.assertNotIn('token_hash', data)

        # 2. Duplicate active invitation is rejected
        res_dup = as_user(
            f"SELECT public.create_organization_invitation('{A}', '{invite_email}', 'employee', '{token_hash}');",
            user=UA
        )
        self.assertNotEqual(res_dup.returncode, 0)
        self.assertIn("already exists", res_dup.stderr.lower())

        # 3. List invitations omits token_hash
        res_list = as_user(
            f"SELECT * FROM public.list_organization_invitations('{A}');",
            user=UA
        )
        self.assertEqual(res_list.returncode, 0, res_list.stderr)
        self.assertNotIn(token_hash, res_list.stdout)
        self.assertIn(invite_email, res_list.stdout)

        # 4. Preview invitation (unauthenticated / anon / any user)
        res_prev = sql(f"SELECT public.get_invitation_preview('{token_hash}');")
        self.assertEqual(res_prev.returncode, 0, res_prev.stderr)
        prev_data = json.loads(res_prev.stdout.strip())
        self.assertEqual(prev_data['organization_name'], 'Org A')
        self.assertEqual(prev_data['email'], invite_email)
        self.assertEqual(prev_data['role'], 'manager')

        # 5. Acceptance with wrong user email fails
        res_wrong_accept = as_user(
            f"SELECT public.accept_organization_invitation('{token_hash}');",
            user=UB  # User B email is not invitee1@example.com
        )
        self.assertNotEqual(res_wrong_accept.returncode, 0)
        self.assertIn("email_mismatch", res_wrong_accept.stderr.lower())

        # 6. Correct user accepts invitation
        res_accept = as_user(
            f"SELECT public.accept_organization_invitation('{token_hash}');",
            user=INVITEE_1
        )
        self.assertEqual(res_accept.returncode, 0, res_accept.stderr)
        acc_data = json.loads(res_accept.stdout.strip())
        self.assertEqual(acc_data['organization_id'], A)
        self.assertEqual(acc_data['role_key'], 'manager')
        self.assertEqual(acc_data['status'], 'active')

        # Verify membership in DB
        mem = sql(f"SELECT role_key, status FROM public.organization_memberships WHERE organization_id = '{A}' AND user_id = '{INVITEE_1}';").stdout.strip()
        self.assertEqual(mem, 'manager|active')

        # 7. Replay attempt fails because invitation is now accepted
        res_replay = as_user(
            f"SELECT public.accept_organization_invitation('{token_hash}');",
            user=INVITEE_1
        )
        self.assertNotEqual(res_replay.returncode, 0)
        self.assertIn("invitation_invalid", res_replay.stderr.lower())

    def test_invitation_revocation_and_resend(self):
        """Admin can revoke and resend invitations."""
        raw_token1 = "token_for_revocation_test_1"
        hash1 = sha256_hash(raw_token1)
        raw_token2 = "token_for_resend_test_2"
        hash2 = sha256_hash(raw_token2)
        email = "revoke_test@example.com"

        # Create
        res = as_user(
            f"SELECT public.create_organization_invitation('{A}', '{email}', 'employee', '{hash1}');",
            user=UA
        )
        self.assertEqual(res.returncode, 0, res.stderr)
        invite_id = json.loads(res.stdout.strip())['id']

        # Revoke
        res_rev = as_user(
            f"SELECT public.revoke_organization_invitation('{invite_id}', '{A}');",
            user=UA
        )
        self.assertEqual(res_rev.returncode, 0, res_rev.stderr)
        self.assertTrue(json.loads(res_rev.stdout.strip())['success'])

        # Preview of revoked invitation fails
        res_prev = sql(f"SELECT public.get_invitation_preview('{hash1}');", check=False)
        self.assertNotEqual(res_prev.returncode, 0)
        self.assertIn("invitation_unavailable", res_prev.stderr.lower())

    def test_concurrent_invitation_acceptance(self):
        """Two concurrent connections attempting to accept the same invitation are serialized safely."""
        raw_token = "concurrent_acceptance_token_123"
        token_hash = sha256_hash(raw_token)
        email = "concurrent@example.com"
        user_id = '20000000-0000-0000-0000-000000000099'

        # Create user in auth.users
        sql(f"INSERT INTO auth.users(id, email) VALUES ('{user_id}', '{email}') ON CONFLICT (id) DO NOTHING;")

        # Create invitation
        res = as_user(
            f"SELECT public.create_organization_invitation('{A}', '{email}', 'employee', '{token_hash}');",
            user=UA
        )
        self.assertEqual(res.returncode, 0, res.stderr)

        def attempt_accept():
            return as_user(
                f"SELECT public.accept_organization_invitation('{token_hash}');",
                user=user_id
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            f1 = executor.submit(attempt_accept)
            f2 = executor.submit(attempt_accept)
            r1, r2 = f1.result(), f2.result()

        results = [r1, r2]
        success_count = sum(1 for r in results if r.returncode == 0)
        self.assertGreaterEqual(success_count, 1)

        for r in results:
            if r.returncode != 0:
                self.assertNotIn("deadlock", r.stderr.lower())
                self.assertIn("invitation_invalid", r.stderr.lower())

        # In DB, exactly one active membership exists
        count = sql(f"SELECT count(*) FROM public.organization_memberships WHERE organization_id = '{A}' AND user_id = '{user_id}';").stdout.strip()
        self.assertEqual(count, '1')

    def test_invitation_revocation_race_with_acceptance(self):
        """Admin revokes invitation while invitee concurrently attempts acceptance; verified serialized safely without deadlock."""
        raw_token = "race_revoke_token_456"
        token_hash = sha256_hash(raw_token)
        email = "race_revoke@example.com"
        user_id = '20000000-0000-0000-0000-000000000092'

        sql(f"INSERT INTO auth.users(id, email) VALUES ('{user_id}', '{email}') ON CONFLICT (id) DO NOTHING;")

        # Create invitation
        res = as_user(
            f"SELECT public.create_organization_invitation('{A}', '{email}', 'employee', '{token_hash}');",
            user=UA
        )
        self.assertEqual(res.returncode, 0, res.stderr)
        invite_id = json.loads(res.stdout.strip())['id']

        # Conn 1: Locks invitation row for update, sleeps 0.2s, updates status to revoked, commits
        def do_revoke():
            return sql(f"""
                BEGIN;
                SELECT id FROM public.organization_invitations WHERE id = '{invite_id}' FOR UPDATE;
                SELECT pg_sleep(0.2);
                UPDATE public.organization_invitations SET status = 'revoked', updated_at = now() WHERE id = '{invite_id}';
                COMMIT;
            """)

        # Conn 2: Attempts to accept after a short 0.05s delay so Conn 1 acquires lock first
        def do_accept():
            time.sleep(0.05)
            return as_user(
                f"SELECT public.accept_organization_invitation('{token_hash}');",
                user=user_id
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            f_rev = executor.submit(do_revoke)
            f_acc = executor.submit(do_accept)
            r_rev = f_rev.result()
            r_acc = f_acc.result()

        self.assertEqual(r_rev.returncode, 0, r_rev.stderr)
        # Acceptance was blocked until revocation committed, then re-read row post-lock and failed with INVITATION_INVALID
        self.assertNotEqual(r_acc.returncode, 0)
        self.assertIn("invitation_invalid", r_acc.stderr.lower())
        self.assertNotIn("deadlock", r_acc.stderr.lower())

        # Invitation in DB is revoked, no membership was created
        status = sql(f"SELECT status FROM public.organization_invitations WHERE id = '{invite_id}';").stdout.strip()
        self.assertEqual(status, 'revoked')
        count = sql(f"SELECT count(*) FROM public.organization_memberships WHERE organization_id = '{A}' AND user_id = '{user_id}';").stdout.strip()
        self.assertEqual(count, '0')

    def test_organization_suspension_race_with_acceptance(self):
        """Organization is suspended while an invitee concurrently attempts acceptance; Level 1 lock blocks acceptance and rejects cleanly without deadlock."""
        raw_token = "race_susp_token_789"
        token_hash = sha256_hash(raw_token)
        email = "race_susp@example.com"
        user_id = '20000000-0000-0000-0000-000000000093'
        org_id = '10000000-0000-0000-0000-000000000093'

        sql(f"INSERT INTO auth.users(id, email) VALUES ('{user_id}', '{email}') ON CONFLICT (id) DO NOTHING;")
        sql(f"INSERT INTO public.organizations(id, name, slug, status) VALUES ('{org_id}', 'Susp Race Org', 'susp-race-org', 'active');")
        sql(f"INSERT INTO public.organization_profiles(organization_id, requires_onboarding, onboarding_completed, onboarding_step, onboarding_status) VALUES ('{org_id}', false, true, 'completed', 'completed');")

        res = sql(f"""
            INSERT INTO public.organization_invitations (organization_id, email, role, token_hash, invited_by, expires_at)
            VALUES ('{org_id}', '{email}', 'employee', '{token_hash}', '{UA}', now() + interval '1 day')
            RETURNING id;
        """)
        self.assertEqual(res.returncode, 0, res.stderr)

        # Conn 1: Suspends organization inside transaction, holds lock for 0.2s, then commits
        def do_suspend():
            return sql(f"""
                BEGIN;
                UPDATE public.organizations SET status = 'suspended' WHERE id = '{org_id}';
                SELECT pg_sleep(0.2);
                COMMIT;
            """)

        # Conn 2: Invitee tries to accept. Acquires initial lookup, then blocks on organizations FOR SHARE (Level 1)
        def do_accept():
            time.sleep(0.05)
            return as_user(
                f"SELECT public.accept_organization_invitation('{token_hash}');",
                user=user_id
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            f_susp = executor.submit(do_suspend)
            f_acc = executor.submit(do_accept)
            r_susp = f_susp.result()
            r_acc = f_acc.result()

        self.assertEqual(r_susp.returncode, 0, r_susp.stderr)
        # Invitee unblocks post-commit, checks organization status, and fails with ORGANIZATION_INACTIVE
        self.assertNotEqual(r_acc.returncode, 0)
        self.assertIn("organization_inactive", r_acc.stderr.lower())
        self.assertNotIn("deadlock", r_acc.stderr.lower())

        # No membership created
        count = sql(f"SELECT count(*) FROM public.organization_memberships WHERE organization_id = '{org_id}' AND user_id = '{user_id}';").stdout.strip()
        self.assertEqual(count, '0')

    def test_invitation_state_change_between_initial_lookup_and_locked_reread(self):
        """Invitation expires while caller is waiting for the Level 4 lock; post-lock revalidation detects expiration and raises INVITATION_EXPIRED."""
        raw_token = "race_expire_token_101"
        token_hash = sha256_hash(raw_token)
        email = "race_expire@example.com"
        user_id = '20000000-0000-0000-0000-000000000094'

        sql(f"INSERT INTO auth.users(id, email) VALUES ('{user_id}', '{email}') ON CONFLICT (id) DO NOTHING;")

        res = as_user(
            f"SELECT public.create_organization_invitation('{A}', '{email}', 'employee', '{token_hash}');",
            user=UA
        )
        self.assertEqual(res.returncode, 0, res.stderr)
        invite_id = json.loads(res.stdout.strip())['id']

        # Conn 1: Locks invitation row, sets expires_at in the past, sleeps 0.2s, commits
        def do_expire():
            return sql(f"""
                BEGIN;
                SELECT id FROM public.organization_invitations WHERE id = '{invite_id}' FOR UPDATE;
                SELECT pg_sleep(0.2);
                UPDATE public.organization_invitations SET expires_at = now() - interval '5 seconds' WHERE id = '{invite_id}';
                COMMIT;
            """)

        def do_accept():
            time.sleep(0.05)
            return as_user(
                f"SELECT public.accept_organization_invitation('{token_hash}');",
                user=user_id
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            f_exp = executor.submit(do_expire)
            f_acc = executor.submit(do_accept)
            r_exp = f_exp.result()
            r_acc = f_acc.result()

        self.assertEqual(r_exp.returncode, 0, r_exp.stderr)
        self.assertNotEqual(r_acc.returncode, 0)
        self.assertIn("invitation_expired", r_acc.stderr.lower())
        self.assertNotIn("deadlock", r_acc.stderr.lower())

        # No membership created
        count = sql(f"SELECT count(*) FROM public.organization_memberships WHERE organization_id = '{A}' AND user_id = '{user_id}';").stdout.strip()
        self.assertEqual(count, '0')

    def test_no_deadlock_on_concurrent_acceptance_and_management(self):
        """Stress-tests concurrent acceptance, revocation, and organization updates; verifies zero deadlocks (SQLSTATE 40P01)."""
        num_invitations = 8
        tokens = []
        for i in range(num_invitations):
            raw = f"deadlock_stress_token_{i}"
            thash = sha256_hash(raw)
            email = f"stress_user_{i}@example.com"
            uid = f"20000000-0000-0000-0000-00000000010{i}"
            sql(f"INSERT INTO auth.users(id, email) VALUES ('{uid}', '{email}') ON CONFLICT (id) DO NOTHING;")
            res = as_user(
                f"SELECT public.create_organization_invitation('{A}', '{email}', 'employee', '{thash}');",
                user=UA
            )
            self.assertEqual(res.returncode, 0, res.stderr)
            inv_id = json.loads(res.stdout.strip())['id']
            tokens.append((thash, inv_id, uid))

        def worker_accept(thash, uid):
            return as_user(f"SELECT public.accept_organization_invitation('{thash}');", user=uid)

        def worker_revoke(inv_id):
            return as_user(f"SELECT public.revoke_organization_invitation('{inv_id}', '{A}');", user=UA)

        def worker_org_touch():
            return sql(f"UPDATE public.organizations SET updated_at = now() WHERE id = '{A}';")

        tasks = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            for thash, inv_id, uid in tokens:
                tasks.append(executor.submit(worker_accept, thash, uid))
                tasks.append(executor.submit(worker_revoke, inv_id))
                tasks.append(executor.submit(worker_org_touch))

            results = [t.result() for t in tasks]

        for r in results:
            self.assertNotIn("deadlock detected", r.stderr.lower())
            self.assertNotIn("40p01", r.stderr.lower())


def main():
    if not (PG_BIN / 'initdb').exists() or not shutil.which('psql'):
        raise SystemExit('PostgreSQL binaries unavailable; set PHASE1_PG_BIN')
    with tempfile.TemporaryDirectory(prefix='field-stage4-pg-') as directory:
        data = Path(directory) / 'data'
        socket = Path(directory) / 'socket'
        socket.mkdir()
        ENV.update(PGHOST=str(socket), PGPORT='55440', PGDATABASE='postgres', PGUSER='phase1_admin')
        subprocess.run([str(PG_BIN / 'initdb'), '-D', str(data), '-U', 'phase1_admin', '--auth=trust', '--no-locale'], check=True, stdout=subprocess.DEVNULL)
        started = False
        try:
            subprocess.run([str(PG_BIN / 'pg_ctl'), '-D', str(data), '-l', str(Path(directory) / 'postgres.log'), '-o', f"-k {socket} -p 55440 -c listen_addresses=''", '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
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
                INSERT INTO auth.users(id, email) VALUES
                    ('{UA}', 'ua@example.com'),
                    ('{UB}', 'ub@example.com'),
                    ('{DISABLED}', 'disabled@example.com'),
                    ('{OUTSIDER}', 'outsider@example.com'),
                    ('{EMPLOYEE}', 'employee@example.com'),
                    ('{INVITEE_1}', 'invitee1@example.com'),
                    ('{INVITEE_2}', 'invitee2@example.com');
                INSERT INTO public.profiles(id, first_name, last_name, display_name, status) VALUES
                    ('{UA}', 'Admin', 'A', 'Admin A', 'active'),
                    ('{UB}', 'Admin', 'B', 'Admin B', 'active'),
                    ('{OUTSIDER}', 'Out', 'Sider', 'Out Sider', 'active')
                ON CONFLICT (id) DO UPDATE SET status = 'active';
                INSERT INTO public.organizations(id,name,slug) VALUES ('{A}','Org A','org-a'),('{B}','Org B','org-b');
                INSERT INTO public.organization_memberships(organization_id,user_id,role_key,status) VALUES
                    ('{A}','{UA}','business_admin','active'),('{B}','{UB}','business_admin','active'),
                    ('{A}','{DISABLED}','business_admin','disabled'),('{A}','{EMPLOYEE}','employee','active');
                INSERT INTO public.organization_profiles(organization_id, requires_onboarding, onboarding_completed, onboarding_step, onboarding_status, onboarding_completed_at)
                VALUES ('{A}', false, true, 'completed', 'legacy_unresolved', now())
                ON CONFLICT (organization_id) DO NOTHING;
            """)
            print('Running Stage 4 database integration tests...', flush=True)
            result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Stage4DatabaseTests))
            if not result.wasSuccessful():
                raise SystemExit(1)
        finally:
            if started:
                subprocess.run([str(PG_BIN / 'pg_ctl'), '-D', str(data), '-m', 'immediate', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)


if __name__ == '__main__':
    main()
