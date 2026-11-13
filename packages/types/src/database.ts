export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      data_source_fields: {
        Row: {
          config_jsonb: Json
          created_at: string
          data_source_id: string
          field_type: string
          id: string
          key: string
          label: string
          order_index: number
          organization_id: string
          required: boolean
        }
        Insert: {
          config_jsonb?: Json
          created_at?: string
          data_source_id: string
          field_type?: string
          id?: string
          key: string
          label: string
          order_index?: number
          organization_id: string
          required?: boolean
        }
        Update: {
          config_jsonb?: Json
          created_at?: string
          data_source_id?: string
          field_type?: string
          id?: string
          key?: string
          label?: string
          order_index?: number
          organization_id?: string
          required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "data_source_fields_org_source_fkey"
            columns: ["organization_id", "data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      data_source_items: {
        Row: {
          created_at: string
          created_by: string
          data_jsonb: Json
          data_source_id: string
          id: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          data_jsonb?: Json
          data_source_id: string
          id?: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          data_jsonb?: Json
          data_source_id?: string
          id?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_source_items_org_source_fkey"
            columns: ["organization_id", "data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      data_sources: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          display_field_key: string
          id: string
          key: string
          name: string
          organization_id: string
          status: string
          updated_at: string
          value_field_key: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          display_field_key: string
          id?: string
          key: string
          name: string
          organization_id: string
          status?: string
          updated_at?: string
          value_field_key: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          display_field_key?: string
          id?: string
          key?: string
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
          value_field_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      form_versions: {
        Row: {
          change_note: string | null
          created_at: string
          created_by: string
          form_id: string
          id: string
          organization_id: string
          published_at: string | null
          published_by: string | null
          schema_jsonb: Json
          schema_version: number
          status: string
          version_number: number
        }
        Insert: {
          change_note?: string | null
          created_at?: string
          created_by: string
          form_id: string
          id?: string
          organization_id: string
          published_at?: string | null
          published_by?: string | null
          schema_jsonb: Json
          schema_version: number
          status: string
          version_number: number
        }
        Update: {
          change_note?: string | null
          created_at?: string
          created_by?: string
          form_id?: string
          id?: string
          organization_id?: string
          published_at?: string | null
          published_by?: string | null
          schema_jsonb?: Json
          schema_version?: number
          status?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_versions_org_form_fkey"
            columns: ["organization_id", "form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      forms: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          current_draft_version_id: string | null
          current_published_version_id: string | null
          description: string | null
          id: string
          key: string
          organization_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          current_draft_version_id?: string | null
          current_published_version_id?: string | null
          description?: string | null
          id?: string
          key: string
          organization_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          current_draft_version_id?: string | null
          current_published_version_id?: string | null
          description?: string | null
          id?: string
          key?: string
          organization_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forms_draft_version_fkey"
            columns: ["current_draft_version_id"]
            isOneToOne: false
            referencedRelation: "form_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forms_published_version_fkey"
            columns: ["current_published_version_id"]
            isOneToOne: false
            referencedRelation: "form_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role_key: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role_key?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role_key?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          status: string
          suspension_type: string | null
          suspended_by_user_id: string | null
          suspension_reason: string | null
          suspended_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          status?: string
          suspension_type?: string | null
          suspended_by_user_id?: string | null
          suspension_reason?: string | null
          suspended_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          status?: string
          suspension_type?: string | null
          suspended_by_user_id?: string | null
          suspension_reason?: string | null
          suspended_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_display_name: string | null
          actor_email: string
          actor_id: string | null
          actor_role: string
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json
          organization_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_display_name?: string | null
          actor_email: string
          actor_id?: string | null
          actor_role: string
          created_at?: string
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          organization_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_display_name?: string | null
          actor_email?: string
          actor_id?: string | null
          actor_role?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          organization_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      platform_administrators: {
        Row: {
          created_at: string
          created_by: string | null
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          organization_id: string
          revoked_at: string | null
          role: string
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          organization_id: string
          revoked_at?: string | null
          role: string
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          organization_id?: string
          revoked_at?: string | null
          role?: string
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_profiles: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          business_email: string | null
          business_phone: string | null
          city: string | null
          country_code: string | null
          created_at: string
          currency_code: string
          date_format: string
          industry: string | null
          logo_path: string | null
          onboarding_completed: boolean
          onboarding_completed_at: string | null
          onboarding_status: string
          onboarding_step: string
          organization_id: string
          postal_code: string | null
          requires_onboarding: boolean
          settings_jsonb: Json
          state_region: string | null
          timezone: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          business_email?: string | null
          business_phone?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          currency_code?: string
          date_format?: string
          industry?: string | null
          logo_path?: string | null
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          onboarding_status?: string
          onboarding_step?: string
          organization_id: string
          postal_code?: string | null
          requires_onboarding?: boolean
          settings_jsonb?: Json
          state_region?: string | null
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          business_email?: string | null
          business_phone?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          currency_code?: string
          date_format?: string
          industry?: string | null
          logo_path?: string | null
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          onboarding_status?: string
          onboarding_step?: string
          organization_id?: string
          postal_code?: string | null
          requires_onboarding?: boolean
          settings_jsonb?: Json
          state_region?: string | null
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          first_name: string | null
          id: string
          last_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_organization_invitation: {
        Args: {
          p_token_hash: string
        }
        Returns: Json
      }
      complete_organization_onboarding: {
        Args: {
          p_organization_id: string
        }
        Returns: Json
      }
      create_business_workspace: {
        Args: {
          p_name: string
          p_slug: string
          p_profile?: Json
        }
        Returns: Json
      }
      create_organization_invitation: {
        Args: {
          p_expires_at?: string | null
          p_email: string
          p_organization_id: string
          p_role: string
          p_token_hash: string
        }
        Returns: Json
      }
      get_invitation_preview: {
        Args: {
          p_token_hash: string
        }
        Returns: Json
      }
      get_organization_role: {
        Args: { target_org_id: string }
        Returns: string
      }
      is_organization_member: {
        Args: { target_org_id: string }
        Returns: boolean
      }
      list_organization_invitations: {
        Args: {
          p_organization_id: string
        }
        Returns: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          organization_id: string
          revoked_at: string | null
          role: string
          status: string
          updated_at: string
        }[]
      }
      publish_form_version: {
        Args: {
          p_form_id: string
          p_version_id: string
          p_change_note?: string | null
        }
        Returns: undefined
      }
      resend_organization_invitation: {
        Args: {
          p_invitation_id: string
          p_new_expires_at?: string | null
          p_new_token_hash: string
          p_organization_id: string
        }
        Returns: Json
      }
      resolve_legacy_organization_profile: {
        Args: {
          p_organization_id: string
        }
        Returns: Json
      }
      revoke_organization_invitation: {
        Args: {
          p_invitation_id: string
          p_organization_id: string
        }
        Returns: Json
      }
      get_organization_members_roster: {
        Args: {
          p_organization_id: string
        }
        Returns: {
          membership_id: string
          organization_id: string
          user_id: string
          role_key: string
          status: string
          email: string | null
          first_name: string | null
          last_name: string | null
          display_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }[]
      }
      manage_organization_membership: {
        Args: {
          p_organization_id: string
          p_target_user_id: string
          p_action: string
          p_new_role?: string | null
        }
        Returns: Json
      }
      manage_organization_lifecycle: {
        Args: {
          p_organization_id: string
          p_new_status: string
          p_reason?: string | null
        }
        Returns: Json
      }
      reactivate_voluntary_suspension: {
        Args: {
          p_organization_id: string
        }
        Returns: Json
      }
      is_platform_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      is_platform_super_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
