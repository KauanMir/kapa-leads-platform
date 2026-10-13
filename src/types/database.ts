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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      campaigns: {
        Row: {
          allowed_origins: string[]
          campaign_key: string
          consent_version: string
          created_at: string
          form_schema: Json
          id: string
          is_active: boolean
          name: string
          slug: string
          store_id: string
          updated_at: string
        }
        Insert: {
          allowed_origins?: string[]
          campaign_key?: string
          consent_version: string
          created_at?: string
          form_schema?: Json
          id?: string
          is_active?: boolean
          name: string
          slug: string
          store_id: string
          updated_at?: string
        }
        Update: {
          allowed_origins?: string[]
          campaign_key?: string
          consent_version?: string
          created_at?: string
          form_schema?: Json
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_events: {
        Row: {
          actor_id: string | null
          created_at: string
          id: number
          lead_id: string
          payload: Json
          store_id: string
          type: Database["public"]["Enums"]["lead_event_type"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: never
          lead_id: string
          payload?: Json
          store_id: string
          type: Database["public"]["Enums"]["lead_event_type"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: never
          lead_id?: string
          payload?: Json
          store_id?: string
          type?: Database["public"]["Enums"]["lead_event_type"]
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_lead_store_fkey"
            columns: ["lead_id", "store_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          lead_id: string
          store_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          lead_id: string
          store_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          lead_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_lead_store_fkey"
            columns: ["lead_id", "store_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          birth_date: string
          campaign_id: string
          client_submission_id: string
          consent_at: string
          consent_version: string
          cpf: string
          cpf_masked: string | null
          created_at: string
          email: string | null
          form_data: Json
          full_name: string
          id: string
          page_url: string | null
          phone: string
          referrer: string | null
          status: Database["public"]["Enums"]["lead_status"]
          store_id: string
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          assigned_to?: string | null
          birth_date: string
          campaign_id: string
          client_submission_id: string
          consent_at?: string
          consent_version: string
          cpf: string
          cpf_masked?: string | null
          created_at?: string
          email?: string | null
          form_data?: Json
          full_name: string
          id?: string
          page_url?: string | null
          phone: string
          referrer?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          store_id: string
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          assigned_to?: string | null
          birth_date?: string
          campaign_id?: string
          client_submission_id?: string
          consent_at?: string
          consent_version?: string
          cpf?: string
          cpf_masked?: string | null
          created_at?: string
          email?: string | null
          form_data?: Json
          full_name?: string
          id?: string
          page_url?: string | null
          phone?: string
          referrer?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          store_id?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assignee_member_fkey"
            columns: ["store_id", "assigned_to"]
            isOneToOne: false
            referencedRelation: "store_members"
            referencedColumns: ["store_id", "user_id"]
          },
          {
            foreignKeyName: "leads_campaign_store_fkey"
            columns: ["campaign_id", "store_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          is_super_admin: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          is_super_admin?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          is_super_admin?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      store_members: {
        Row: {
          created_at: string
          is_active: boolean
          role: Database["public"]["Enums"]["store_member_role"]
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["store_member_role"]
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["store_member_role"]
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_members_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_lead: {
        Args: { p_assignee_id: string; p_lead_id: string }
        Returns: undefined
      }
      lead_kpis: {
        Args: {
          p_campaign_id?: string
          p_from?: string
          p_store_id?: string
          p_to?: string
        }
        Returns: {
          assigned_to: string
          first_contact_leads: number
          first_contact_seconds: number
          leads: number
          status: Database["public"]["Enums"]["lead_status"]
        }[]
      }
      reveal_lead_cpf: { Args: { p_lead_id: string }; Returns: string }
      store_team: {
        Args: never
        Returns: {
          full_name: string
          is_active: boolean
          role: Database["public"]["Enums"]["store_member_role"]
          store_id: string
          user_id: string
        }[]
      }
    }
    Enums: {
      lead_event_type:
        | "CREATED"
        | "STATUS_CHANGED"
        | "NOTE_ADDED"
        | "WHATSAPP_OPENED"
        | "PHONE_CLICKED"
        | "CPF_REVEALED"
        | "ASSIGNED"
      lead_status: "NEW" | "CONTACTED" | "IN_PROGRESS" | "WON" | "LOST"
      store_member_role: "STORE_ADMIN" | "STORE_USER"
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
    Enums: {
      lead_event_type: [
        "CREATED",
        "STATUS_CHANGED",
        "NOTE_ADDED",
        "WHATSAPP_OPENED",
        "PHONE_CLICKED",
        "CPF_REVEALED",
        "ASSIGNED",
      ],
      lead_status: ["NEW", "CONTACTED", "IN_PROGRESS", "WON", "LOST"],
      store_member_role: ["STORE_ADMIN", "STORE_USER"],
    },
  },
} as const
