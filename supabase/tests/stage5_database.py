#!/usr/bin/env python3
"""Stage 5 Database Tests: Tenant Management, Membership Governance & Audit Logging

Tests PostgreSQL RLS, immutability triggers, row locks, last-admin invariants,
platform administrator lifecycle, platform role separation, voluntary reactivation,
and Stage 4 audit instrumentation in a disposable local cluster.
Run: python3 supabase/tests/stage5_database.py
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

PLATFORM_SUPER = '20000000-0000-0000-0000-000000000000'
PLATFORM_SUPER2 = '20000000-0000-0000-0000-000000000010'
PLATFORM_SUPPORT = '20000000-0000-0000-0000-000000000020'
PLATFORM_AUDITOR = '20000000-0000-0000-0000-000000000030'
UA = '20000000-0000-0000-0000-000000000001'  # Super Admin in Org A
UB = '20000000-0000-0000-0000-000000000002'  # Business Admin in Org A
UC = '20000000-0000-0000-0000-000000000003'  # Manager in Org A
EMPLOYEE = '20000000-0000-0000-0000-000000000005'
OUTSIDER = '20000000-0000-0000-0000-000000000004'
INVITED_USER = '20000000-0000-0000-0000-000000000009'

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


def as_role(statement, role='service_role'):
    return sql(f'BEGIN; SET LOCAL ROLE {role}; {statement}; COMMIT;', check=False)


class Stage5DatabaseTests(unittest.TestCase):
    def setUp(self):
        sql(f"""
            DELETE FROM public.platform_administrators 
            WHERE user_id NOT IN ('{PLATFORM_SUPER}', '{PLATFORM_SUPPORT}', '{PLATFORM_AUDITOR}');
            INSERT INTO public.platform_administrators(user_id, role, is_active) VALUES
                ('{PLATFORM_SUPER}', 'platform_super_admin', true),
                ('{PLATFORM_SUPPORT}', 'platform_support', true),
                ('{PLATFORM_AUDITOR}', 'platform_auditor', true)
            ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, is_active = true;
        """)

    def denied(self, statement, user=UA, error='permission denied'):
        result = as_user(statement, user)
        self.assertNotEqual(result.returncode, 0, f"Expected error but succeeded: {result.stdout}")
        self.assertIn(error.lower(), result.stderr.lower(), f"Expected '{error}' in: {result.stderr}")

    def test_direct_audit_log_insert_update_delete_denied(self):
        """Direct INSERT, UPDATE, DELETE on audit_logs by authenticated users is strictly prohibited."""
        # Direct INSERT denied
        self.denied(
            f"INSERT INTO public.audit_logs (organization_id, actor_email, actor_role, event_type, entity_type, entity_id, action) "
            f"VALUES ('{A}', 'hacker@example.com', 'admin', 'hack', 'org', '{A}', 'spoof');",
            user=UA,
            error="permission denied"
        )
        # Direct UPDATE denied
        self.denied(
            f"UPDATE public.audit_logs SET action = 'tampered' WHERE organization_id = '{A}';",
            user=UA,
            error="permission denied"
        )
        # Direct DELETE denied
        self.denied(
            f"DELETE FROM public.audit_logs WHERE organization_id = '{A}';",
            user=UA,
            error="permission denied"
        )

    def test_audit_log_truncate_denied_to_service_role_and_protected(self):
        """TRUNCATE on public.audit_logs is explicitly denied to service_role and blocked by trigger."""
        res_service_role = as_role("TRUNCATE TABLE public.audit_logs;", role='service_role')
        self.assertNotEqual(res_service_role.returncode, 0)
        self.assertTrue(
            "permission denied" in res_service_role.stderr.lower() or
            "audit_log_immutable" in res_service_role.stderr.lower(),
            f"Expected permission denied or immutable trigger, got: {res_service_role.stderr}"
        )

        res_anon = as_role("TRUNCATE TABLE public.audit_logs;", role='anon')
        self.assertNotEqual(res_anon.returncode, 0)

        res_auth = as_user("TRUNCATE TABLE public.audit_logs;", user=UA)
        self.assertNotEqual(res_auth.returncode, 0)

    def test_audit_actor_identity_tamper_resistance(self):
        """Audit actor identity is derived strictly from auth.uid() session context and cannot be forged."""
        # UA performs a membership update on UC
        res = as_user(
            f"SELECT public.manage_organization_membership('{A}', '{UC}', 'update_role', 'business_admin');",
            user=UA
        )
        self.assertEqual(res.returncode, 0)

        # Retrieve the latest audit log entry for this action
        res_log = sql(f"""
            SELECT actor_id, actor_email, actor_role, actor_display_name 
            FROM public.audit_logs 
            WHERE organization_id = '{A}' AND event_type = 'member.role_updated' AND entity_id = (
                SELECT id FROM public.organization_memberships WHERE organization_id = '{A}' AND user_id = '{UC}'
            )
            ORDER BY created_at DESC LIMIT 1;
        """)
        self.assertTrue(res_log.stdout.strip())
        parts = res_log.stdout.strip().split('|')
        self.assertEqual(parts[0], UA)
        self.assertEqual(parts[1], 'ua@example.com')
        self.assertEqual(parts[2], 'super_admin')
        self.assertEqual(parts[3], 'Admin A')

        # Demote UC back to manager
        as_user(
            f"SELECT public.manage_organization_membership('{A}', '{UC}', 'update_role', 'manager');",
            user=UA
        )

    def test_last_admin_protection_demotion_rejected(self):
        """The sole active administrator cannot be demoted to manager or employee."""
        # In Org B, UB is the sole active admin. Attempt demoting UB to employee.
        res = as_user(
            f"SELECT public.manage_organization_membership('{B}', '{UB}', 'update_role', 'employee');",
            user=UB
        )
        self.assertNotEqual(res.returncode, 0)
        self.assertIn("cannot_remove_last_admin", res.stderr.lower())

    def test_last_admin_protection_removal_rejected(self):
        """The sole active administrator cannot be removed or leave the workspace."""
        # In Org B, UB is the sole active admin. Attempt removing UB.
        res = as_user(
            f"SELECT public.manage_organization_membership('{B}', '{UB}', 'remove');",
            user=UB
        )
        self.assertNotEqual(res.returncode, 0)
        self.assertIn("cannot_remove_last_admin", res.stderr.lower())

    def test_admin_can_promote_and_demote_when_peers_exist(self):
        """Admins can promote and demote members when another admin exists."""
        # Org A has UA (super_admin) and UB (business_admin).
        # UA promotes UC (manager) to business_admin.
        res = as_user(
            f"SELECT public.manage_organization_membership('{A}', '{UC}', 'update_role', 'business_admin');",
            user=UA
        )
        self.assertEqual(res.returncode, 0, res.stderr)
        data = json.loads(res.stdout.strip())
        self.assertTrue(data['success'])
        self.assertEqual(data['role_key'], 'business_admin')

        # Now 3 admins exist (UA, UB, UC). UA demotes UC back to manager.
        res2 = as_user(
            f"SELECT public.manage_organization_membership('{A}', '{UC}', 'update_role', 'manager');",
            user=UA
        )
        self.assertEqual(res2.returncode, 0, res2.stderr)
        data2 = json.loads(res2.stdout.strip())
        self.assertTrue(data2['success'])
        self.assertEqual(data2['role_key'], 'manager')

    def test_hierarchical_rbac_super_admin_protection(self):
        """Business admin cannot grant super_admin, nor demote/remove super_admin."""
        # UB is business_admin in Org A. UA is super_admin in Org A.
        # UB attempts to grant super_admin to UC -> Rejected.
        res = as_user(
            f"SELECT public.manage_organization_membership('{A}', '{UC}', 'update_role', 'super_admin');",
            user=UB
        )
        self.assertNotEqual(res.returncode, 0)
        self.assertIn("unauthorized", res.stderr.lower())

        # UB attempts to demote UA (super_admin) -> Rejected.
        res2 = as_user(
            f"SELECT public.manage_organization_membership('{A}', '{UA}', 'update_role', 'employee');",
            user=UB
        )
        self.assertNotEqual(res2.returncode, 0)
        self.assertIn("unauthorized", res2.stderr.lower())

    def test_platform_admin_lifecycle_and_last_super_admin_protection(self):
        """Platform administrators can be appointed and revoked only by active super admins; last super admin is protected."""
        # Non-platform admin UA cannot appoint
        res_denied = as_user(
            f"SELECT public.appoint_platform_administrator('{UC}', 'platform_support');",
            user=UA
        )
        self.assertNotEqual(res_denied.returncode, 0)
        self.assertIn("unauthorized", res_denied.stderr.lower())

        # Platform super admin appoints UC as platform_support
        res_appoint = as_user(
            f"SELECT public.appoint_platform_administrator('{UC}', 'platform_support');",
            user=PLATFORM_SUPER
        )
        self.assertEqual(res_appoint.returncode, 0, res_appoint.stderr)
        data_appoint = json.loads(res_appoint.stdout.strip())
        self.assertTrue(data_appoint['success'])
        self.assertEqual(data_appoint['role'], 'platform_support')

        # Verify audit log recorded platform_admin.appointed
        res_audit = sql(f"""
            SELECT count(*) FROM public.audit_logs 
            WHERE event_type = 'platform_admin.appointed' AND entity_id = '{UC}';
        """)
        self.assertGreaterEqual(int(res_audit.stdout.strip()), 1)

        # Platform support UC cannot revoke PLATFORM_SUPER
        res_support_rev = as_user(
            f"SELECT public.revoke_platform_administrator('{PLATFORM_SUPER}');",
            user=UC
        )
        self.assertNotEqual(res_support_rev.returncode, 0)
        self.assertIn("unauthorized", res_support_rev.stderr.lower())

        # PLATFORM_SUPER attempts to revoke self while being the only active super_admin -> REJECTED
        res_last = as_user(
            f"SELECT public.revoke_platform_administrator('{PLATFORM_SUPER}');",
            user=PLATFORM_SUPER
        )
        self.assertNotEqual(res_last.returncode, 0)
        self.assertIn("cannot_remove_last_platform_super_admin", res_last.stderr.lower())

        # Appoint PLATFORM_SUPER2 as second super_admin
        res_appoint2 = as_user(
            f"SELECT public.appoint_platform_administrator('{PLATFORM_SUPER2}', 'platform_super_admin');",
            user=PLATFORM_SUPER
        )
        self.assertEqual(res_appoint2.returncode, 0, res_appoint2.stderr)

        # Now PLATFORM_SUPER can revoke PLATFORM_SUPER2
        res_rev = as_user(
            f"SELECT public.revoke_platform_administrator('{PLATFORM_SUPER2}');",
            user=PLATFORM_SUPER
        )
        self.assertEqual(res_rev.returncode, 0, res_rev.stderr)
        data_rev = json.loads(res_rev.stdout.strip())
        self.assertFalse(data_rev['is_active'])

        # Verify audit log recorded platform_admin.revoked
        res_audit2 = sql(f"""
            SELECT count(*) FROM public.audit_logs 
            WHERE event_type = 'platform_admin.revoked' AND entity_id = '{PLATFORM_SUPER2}';
        """)
        self.assertGreaterEqual(int(res_audit2.stdout.strip()), 1)

        # Cleaning up UC platform status
        sql(f"DELETE FROM public.platform_administrators WHERE user_id = '{UC}';")

    def test_concurrent_platform_super_admin_revocation_race(self):
        """Concurrent revocation of two platform super admins serializes safely and preserves the last super admin."""
        # Ensure PLATFORM_SUPER and PLATFORM_SUPER2 are both active super admins
        sql(f"""
            INSERT INTO public.platform_administrators(user_id, role, is_active)
            VALUES ('{PLATFORM_SUPER2}', 'platform_super_admin', true)
            ON CONFLICT (user_id) DO UPDATE SET role = 'platform_super_admin', is_active = true;
        """)

        def run_self_revoke(actor):
            cmd = f"SELECT public.revoke_platform_administrator('{actor}');"
            return as_user(cmd, user=actor)

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            t1 = executor.submit(run_self_revoke, PLATFORM_SUPER)
            t2 = executor.submit(run_self_revoke, PLATFORM_SUPER2)
            r1 = t1.result()
            r2 = t2.result()

        results = [r1, r2]
        successes = [r for r in results if r.returncode == 0]
        failures = [r for r in results if r.returncode != 0]

        # Exactly one must succeed and one must fail with cannot_remove_last_platform_super_admin
        self.assertEqual(len(successes), 1, f"Expected 1 success, got {len(successes)}")
        self.assertEqual(len(failures), 1, f"Expected 1 failure, got {len(failures)}")
        self.assertIn("cannot_remove_last_platform_super_admin", failures[0].stderr.lower())

        # Active super admin count in database must be exactly 1
        res_count = sql("SELECT count(*) FROM public.platform_administrators WHERE role = 'platform_super_admin' AND is_active = true;")
        self.assertEqual(int(res_count.stdout.strip()), 1)

    def test_platform_role_separation_auditor_support_super(self):
        """Platform auditor is read-only, support is operational, super admin governs lifecycle."""
        # Provision test org
        res_ws = as_user(
            f"SELECT public.create_business_workspace('Platform Role WS', 'platform-role-ws');",
            user=UA
        )
        org_id = json.loads(res_ws.stdout.strip())['organization_id']

        # 1. Platform Auditor attempts suspension -> REJECTED
        res_auditor = as_user(
            f"SELECT public.manage_organization_lifecycle('{org_id}', 'suspended', 'Audit check');",
            user=PLATFORM_AUDITOR
        )
        self.assertNotEqual(res_auditor.returncode, 0)
        self.assertIn("platform auditors possess read-only privileges", res_auditor.stderr.lower())

        # 2. Platform Support operational suspension -> SUCCEEDS
        res_support = as_user(
            f"SELECT public.manage_organization_lifecycle('{org_id}', 'suspended', 'Billing failure');",
            user=PLATFORM_SUPPORT
        )
        self.assertEqual(res_support.returncode, 0, res_support.stderr)
        data_support = json.loads(res_support.stdout.strip())
        self.assertEqual(data_support['suspension_type'], 'platform_enforcement')

        # 3. Platform Support attempts archiving -> REJECTED
        res_support_archive = as_user(
            f"SELECT public.manage_organization_lifecycle('{org_id}', 'archived');",
            user=PLATFORM_SUPPORT
        )
        self.assertNotEqual(res_support_archive.returncode, 0)
        self.assertIn("platform super administrator privileges required", res_support_archive.stderr.lower())

        # 4. Platform Support operational reactivation -> SUCCEEDS
        res_support_reactivate = as_user(
            f"SELECT public.manage_organization_lifecycle('{org_id}', 'active');",
            user=PLATFORM_SUPPORT
        )
        self.assertEqual(res_support_reactivate.returncode, 0, res_support_reactivate.stderr)

        # 5. Platform Super Admin can archive
        res_super_archive = as_user(
            f"SELECT public.manage_organization_lifecycle('{org_id}', 'archived');",
            user=PLATFORM_SUPER
        )
        self.assertEqual(res_super_archive.returncode, 0, res_super_archive.stderr)

    def test_voluntary_suspension_and_reactivation_strict_super_admin(self):
        """Voluntary suspension and reactivation are strictly restricted to tenant super_admin."""
        res = as_user(
            f"SELECT public.create_business_workspace('Voluntary WS Strict', 'voluntary-ws-strict');",
            user=UA
        )
        org_id = json.loads(res.stdout.strip())['organization_id']

        # Add UB as business_admin
        sql(f"""
            INSERT INTO public.organization_memberships(organization_id, user_id, role_key, status)
            VALUES ('{org_id}', '{UB}', 'business_admin', 'active');
        """)
        # Ensure UA is super_admin
        sql(f"UPDATE public.organization_memberships SET role_key = 'super_admin' WHERE organization_id = '{org_id}' AND user_id = '{UA}';")

        # Business Admin UB attempts voluntary suspension -> REJECTED
        res_bad_suspend = as_user(
            f"SELECT public.manage_organization_lifecycle('{org_id}', 'suspended', 'Unauthorized test');",
            user=UB
        )
        self.assertNotEqual(res_bad_suspend.returncode, 0)
        self.assertIn("only a tenant super administrator", res_bad_suspend.stderr.lower())

        # Tenant Super Admin UA voluntarily suspends -> SUCCEEDS
        res_suspend = as_user(
            f"SELECT public.manage_organization_lifecycle('{org_id}', 'suspended', 'Scheduled maintenance');",
            user=UA
        )
        self.assertEqual(res_suspend.returncode, 0, res_suspend.stderr)
        data_suspend = json.loads(res_suspend.stdout.strip())
        self.assertEqual(data_suspend['suspension_type'], 'voluntary')

        # Business Admin UB attempts voluntary reactivation -> REJECTED
        res_bad_reactivate = as_user(
            f"SELECT public.reactivate_voluntary_suspension('{org_id}');",
            user=UB
        )
        self.assertNotEqual(res_bad_reactivate.returncode, 0)
        self.assertIn("only a tenant super administrator", res_bad_reactivate.stderr.lower())

        # Tenant Super Admin UA voluntarily reactivates -> SUCCEEDS
        res_reactivate = as_user(
            f"SELECT public.reactivate_voluntary_suspension('{org_id}');",
            user=UA
        )
        self.assertEqual(res_reactivate.returncode, 0, res_reactivate.stderr)
        data_reactivate = json.loads(res_reactivate.stdout.strip())
        self.assertTrue(data_reactivate['success'])
        self.assertEqual(data_reactivate['status'], 'active')

    def test_platform_enforced_suspension_blocks_tenant_reactivation(self):
        """Tenant admins cannot reactivate an organization suspended by platform enforcement."""
        # Provision workspace
        res = as_user(
            f"SELECT public.create_business_workspace('Platform Enforced WS 2', 'platform-enforced-ws-2');",
            user=UA
        )
        org_id = json.loads(res.stdout.strip())['organization_id']

        # Platform admin suspends organization
        res_suspend = as_user(
            f"SELECT public.manage_organization_lifecycle('{org_id}', 'suspended', 'Terms of Service violation');",
            user=PLATFORM_SUPER
        )
        self.assertEqual(res_suspend.returncode, 0, res_suspend.stderr)
        data_suspend = json.loads(res_suspend.stdout.strip())
        self.assertEqual(data_suspend['suspension_type'], 'platform_enforcement')

        # Tenant admin UA attempts to self-reactivate -> MUST BE REJECTED
        res_reactivate = as_user(
            f"SELECT public.reactivate_voluntary_suspension('{org_id}');",
            user=UA
        )
        self.assertNotEqual(res_reactivate.returncode, 0)
        self.assertIn("unauthorized_reactivation", res_reactivate.stderr.lower())

    def test_stage4_onboarding_and_invitation_audit_events(self):
        """Stage 4 actions emit atomic audit events without leaking raw credentials or tokens."""
        # 1. Onboarding completion
        res_ws = as_user(
            f"SELECT public.create_business_workspace('Audit Stage4 WS', 'audit-stage4-ws');",
            user=UA
        )
        org_id = json.loads(res_ws.stdout.strip())['organization_id']
        sql(f"UPDATE public.organization_memberships SET role_key = 'super_admin' WHERE organization_id = '{org_id}' AND user_id = '{UA}';")

        res_onboard = as_user(
            f"SELECT public.complete_organization_onboarding('{org_id}');",
            user=UA
        )
        self.assertEqual(res_onboard.returncode, 0, res_onboard.stderr)

        # Verify audit log for onboarding
        res_audit_onboard = sql(f"""
            SELECT count(*) FROM public.audit_logs
            WHERE organization_id = '{org_id}' AND event_type = 'organization.onboarding_completed';
        """)
        self.assertEqual(int(res_audit_onboard.stdout.strip()), 1)

        # 2. Invitation creation
        raw_token = 'secret_token_12345678901234567890123456789012'
        token_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
        target_email = 'invitee@example.com'

        res_invite = as_user(
            f"SELECT public.create_organization_invitation('{org_id}', '{target_email}', 'manager', '{token_hash}');",
            user=UA
        )
        self.assertEqual(res_invite.returncode, 0, res_invite.stderr)
        invite_id = json.loads(res_invite.stdout.strip())['id']

        # Verify audit log for invitation created
        res_audit_invite = sql(f"""
            SELECT metadata FROM public.audit_logs
            WHERE organization_id = '{org_id}' AND event_type = 'invitation.created' AND entity_id = '{invite_id}';
        """)
        self.assertTrue(res_audit_invite.stdout.strip())
        meta = json.loads(res_audit_invite.stdout.strip())
        self.assertEqual(meta['email'], target_email)
        self.assertEqual(meta['role'], 'manager')
        # Crucial check: raw token and token_hash are NOT stored in metadata
        self.assertNotIn('token_hash', meta)
        self.assertNotIn(raw_token, res_audit_invite.stdout)

        # 3. Invitation acceptance by invited user
        res_accept = as_user(
            f"SELECT public.accept_organization_invitation('{token_hash}');",
            user=INVITED_USER
        )
        self.assertEqual(res_accept.returncode, 0, res_accept.stderr)

        # Verify audit log for invitation accepted
        res_audit_accept = sql(f"""
            SELECT count(*) FROM public.audit_logs
            WHERE organization_id = '{org_id}' AND event_type = 'invitation.accepted' AND entity_id = '{invite_id}';
        """)
        self.assertEqual(int(res_audit_accept.stdout.strip()), 1)

        # 4. Invitation revocation
        token_hash2 = hashlib.sha256('second_secret_token_abc'.encode('utf-8')).hexdigest()
        res_invite2 = as_user(
            f"SELECT public.create_organization_invitation('{org_id}', 'revokee@example.com', 'employee', '{token_hash2}');",
            user=UA
        )
        self.assertEqual(res_invite2.returncode, 0, res_invite2.stderr)
        invite_id2 = json.loads(res_invite2.stdout.strip())['id']

        res_revoke = as_user(
            f"SELECT public.revoke_organization_invitation('{invite_id2}', '{org_id}');",
            user=UA
        )
        self.assertEqual(res_revoke.returncode, 0, res_revoke.stderr)

        # Verify audit log for invitation revoked
        res_audit_revoke = sql(f"""
            SELECT count(*) FROM public.audit_logs
            WHERE organization_id = '{org_id}' AND event_type = 'invitation.revoked' AND entity_id = '{invite_id2}';
        """)
        self.assertEqual(int(res_audit_revoke.stdout.strip()), 1)

    def test_audit_logs_tenant_and_platform_isolation(self):
        """Tenant admins can view own org logs; platform logs (org_id IS NULL) are isolated."""
        # Insert a platform-level event as platform super admin
        sql(f"""
            SELECT public.internal_record_audit_event(
                NULL,
                'platform.security_policy_updated',
                'platform_configuration',
                '{PLATFORM_SUPER}',
                'update_policy',
                '{{"mode": "strict"}}'::jsonb
            );
        """)

        # Tenant admin UA queries audit logs
        res_tenant = as_user(
            f"SELECT count(*) FROM public.audit_logs WHERE organization_id = '{A}';",
            user=UA
        )
        self.assertEqual(res_tenant.returncode, 0)
        tenant_count = int(res_tenant.stdout.strip())
        self.assertGreaterEqual(tenant_count, 0)

        # Tenant admin UA queries platform events (org_id IS NULL) -> Must return 0 rows under RLS
        res_platform_by_tenant = as_user(
            f"SELECT count(*) FROM public.audit_logs WHERE organization_id IS NULL;",
            user=UA
        )
        self.assertEqual(res_platform_by_tenant.returncode, 0)
        self.assertEqual(int(res_platform_by_tenant.stdout.strip()), 0)

        # Platform admin queries platform events -> Must see the platform event
        res_platform_by_platform = as_user(
            f"SELECT count(*) FROM public.audit_logs WHERE organization_id IS NULL;",
            user=PLATFORM_SUPER
        )
        self.assertEqual(res_platform_by_platform.returncode, 0)
        self.assertGreaterEqual(int(res_platform_by_platform.stdout.strip()), 1)

    def test_get_organization_members_roster(self):
        """Active members can view roster with profile metadata; outsiders are denied."""
        res = as_user(
            f"SELECT count(*) FROM public.get_organization_members_roster('{A}');",
            user=UA
        )
        self.assertEqual(res.returncode, 0, res.stderr)
        self.assertGreaterEqual(int(res.stdout.strip()), 2)

        # Outsider denied
        res_out = as_user(
            f"SELECT count(*) FROM public.get_organization_members_roster('{A}');",
            user=OUTSIDER
        )
        self.assertNotEqual(res_out.returncode, 0)
        self.assertIn("unauthorized", res_out.stderr.lower())

    def test_concurrent_cross_demotion_race_serializes_safely(self):
        """Two active admins concurrently attempting cross-demotion serialize without deadlock."""
        # Setup temporary org with exactly 2 admins: UA and UB
        res = as_user(
            f"SELECT public.create_business_workspace('Race Test Org', 'race-test-org');",
            user=UA
        )
        self.assertEqual(res.returncode, 0, res.stderr)
        org_id = json.loads(res.stdout.strip())['organization_id']

        sql(f"""
            INSERT INTO public.organization_memberships(organization_id, user_id, role_key, status)
            VALUES ('{org_id}', '{UB}', 'business_admin', 'active');
        """)

        def run_demote(actor, target):
            cmd = f"""
            SELECT public.manage_organization_membership('{org_id}', '{target}', 'update_role', 'employee');
            """
            return as_user(cmd, user=actor)

        # Execute concurrent demotions on separate connections
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            t1 = executor.submit(run_demote, UA, UB)
            t2 = executor.submit(run_demote, UB, UA)
            r1 = t1.result()
            r2 = t2.result()

        # Exactly one must succeed and one must fail
        results = [r1, r2]
        successes = [r for r in results if r.returncode == 0]
        failures = [r for r in results if r.returncode != 0]

        self.assertEqual(len(successes), 1, f"Expected 1 success, got {len(successes)}. r1: {r1.stderr}, r2: {r2.stderr}")
        self.assertEqual(len(failures), 1, f"Expected 1 failure, got {len(failures)}")

        # No deadlock (SQLSTATE 40P01)
        for r in results:
            self.assertNotIn("deadlock detected", r.stderr.lower())
            self.assertNotIn("40p01", r.stderr.lower())


def main():
    if not (PG_BIN / 'initdb').exists() or not shutil.which('psql'):
        raise SystemExit('PostgreSQL binaries unavailable; set PHASE1_PG_BIN')
    with tempfile.TemporaryDirectory(prefix='field-stage5-pg-') as directory:
        data = Path(directory) / 'data'
        socket = Path(directory) / 'socket'
        socket.mkdir()
        ENV.update(PGHOST=str(socket), PGPORT='55441', PGDATABASE='postgres', PGUSER='stage5_admin')
        subprocess.run([str(PG_BIN / 'initdb'), '-D', str(data), '-U', 'stage5_admin', '--auth=trust', '--no-locale'], check=True, stdout=subprocess.DEVNULL)
        started = False
        try:
            subprocess.run([str(PG_BIN / 'pg_ctl'), '-D', str(data), '-l', str(Path(directory) / 'postgres.log'), '-o', f"-k {socket} -p 55441 -c listen_addresses=''", '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
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
                GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
            """)
            for migration in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
                sql(migration.read_text())
                print('Applied locally:', migration.name, flush=True)
            sql(f"""
                INSERT INTO auth.users(id, email) VALUES
                    ('{PLATFORM_SUPER}', 'platform@internal.com'),
                    ('{PLATFORM_SUPER2}', 'platform2@internal.com'),
                    ('{PLATFORM_SUPPORT}', 'support@internal.com'),
                    ('{PLATFORM_AUDITOR}', 'auditor@internal.com'),
                    ('{UA}', 'ua@example.com'),
                    ('{UB}', 'ub@example.com'),
                    ('{UC}', 'uc@example.com'),
                    ('{OUTSIDER}', 'outsider@example.com'),
                    ('{EMPLOYEE}', 'employee@example.com'),
                    ('{INVITED_USER}', 'invitee@example.com');
                INSERT INTO public.profiles(id, first_name, last_name, display_name, status) VALUES
                    ('{PLATFORM_SUPER}', 'Platform', 'Super', 'Platform Super', 'active'),
                    ('{PLATFORM_SUPER2}', 'Platform', 'Super2', 'Platform Super 2', 'active'),
                    ('{PLATFORM_SUPPORT}', 'Platform', 'Support', 'Platform Support', 'active'),
                    ('{PLATFORM_AUDITOR}', 'Platform', 'Auditor', 'Platform Auditor', 'active'),
                    ('{UA}', 'Admin', 'A', 'Admin A', 'active'),
                    ('{UB}', 'Admin', 'B', 'Admin B', 'active'),
                    ('{UC}', 'Manager', 'C', 'Manager C', 'active'),
                    ('{OUTSIDER}', 'Out', 'Sider', 'Out Sider', 'active'),
                    ('{EMPLOYEE}', 'Emp', 'Loyee', 'Employee', 'active'),
                    ('{INVITED_USER}', 'Invited', 'User', 'Invited User', 'active')
                ON CONFLICT (id) DO UPDATE SET 
                    display_name = EXCLUDED.display_name,
                    first_name = EXCLUDED.first_name,
                    last_name = EXCLUDED.last_name,
                    status = 'active';
                INSERT INTO public.organizations(id,name,slug) VALUES ('{A}','Org A','org-a'),('{B}','Org B','org-b');
                INSERT INTO public.organization_memberships(organization_id,user_id,role_key,status) VALUES
                    ('{A}','{UA}','super_admin','active'),
                    ('{A}','{UB}','business_admin','active'),
                    ('{A}','{UC}','manager','active'),
                    ('{A}','{EMPLOYEE}','employee','active'),
                    ('{B}','{UB}','business_admin','active');
                INSERT INTO public.platform_administrators(user_id, role, is_active) VALUES
                    ('{PLATFORM_SUPER}', 'platform_super_admin', true),
                    ('{PLATFORM_SUPPORT}', 'platform_support', true),
                    ('{PLATFORM_AUDITOR}', 'platform_auditor', true);
            """)
            print('Running Stage 5 database integration tests...', flush=True)
            result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Stage5DatabaseTests))
            if not result.wasSuccessful():
                raise SystemExit(1)
        finally:
            if started:
                subprocess.run([str(PG_BIN / 'pg_ctl'), '-D', str(data), '-m', 'immediate', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)


if __name__ == '__main__':
    main()
