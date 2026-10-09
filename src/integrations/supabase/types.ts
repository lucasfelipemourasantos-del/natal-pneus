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
      admin_audit: {
        Row: {
          action: string
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          id: string
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      badges: {
        Row: {
          created_at: string
          description: string
          id: string
          image_path: string | null
          name: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          image_path?: string | null
          name: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          image_path?: string | null
          name?: string
        }
        Relationships: []
      }
      courses: {
        Row: {
          area: string
          created_at: string
          created_by: string | null
          description: string
          file_name: string | null
          file_path: string | null
          id: string
          level: string
          target_job_role: string | null
          title: string
          unit_code: string | null
          video_url: string | null
        }
        Insert: {
          area?: string
          created_at?: string
          created_by?: string | null
          description?: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          level?: string
          target_job_role?: string | null
          title: string
          unit_code?: string | null
          video_url?: string | null
        }
        Update: {
          area?: string
          created_at?: string
          created_by?: string | null
          description?: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          level?: string
          target_job_role?: string | null
          title?: string
          unit_code?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_unit_code_fkey"
            columns: ["unit_code"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["code"]
          },
        ]
      }
      employee_badges: {
        Row: {
          awarded_at: string
          badge_id: string
          id: string
          note: string
          user_id: string
        }
        Insert: {
          awarded_at?: string
          badge_id: string
          id?: string
          note?: string
          user_id: string
        }
        Update: {
          awarded_at?: string
          badge_id?: string
          id?: string
          note?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_functions: {
        Row: {
          all_stores: boolean
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          all_stores?: boolean
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          all_stores?: boolean
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          admission_date: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          internal_id: string | null
          job_role: string | null
          phone: string | null
          requested_all_stores: boolean
          requested_job_role: string | null
          requested_unit_code: string | null
          sector_id: string | null
          status: Database["public"]["Enums"]["access_status"]
          unit: string | null
          unit_code: string | null
          updated_at: string
        }
        Insert: {
          admission_date?: string | null
          created_at?: string
          email: string
          full_name?: string
          id: string
          internal_id?: string | null
          job_role?: string | null
          phone?: string | null
          requested_all_stores?: boolean
          requested_job_role?: string | null
          requested_unit_code?: string | null
          sector_id?: string | null
          status?: Database["public"]["Enums"]["access_status"]
          unit?: string | null
          unit_code?: string | null
          updated_at?: string
        }
        Update: {
          admission_date?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          internal_id?: string | null
          job_role?: string | null
          phone?: string | null
          requested_all_stores?: boolean
          requested_job_role?: string | null
          requested_unit_code?: string | null
          sector_id?: string | null
          status?: Database["public"]["Enums"]["access_status"]
          unit?: string | null
          unit_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_requested_unit_code_fkey"
            columns: ["requested_unit_code"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "profiles_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_unit_code_fkey"
            columns: ["unit_code"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["code"]
          },
        ]
      }
      sales_results: {
        Row: {
          amount_cents: number
          competence: string
          created_at: string
          created_by: string | null
          dimension: string
          employee_id: string | null
          id: string
          sector_id: string | null
          unit_code: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_cents: number
          competence: string
          created_at?: string
          created_by?: string | null
          dimension: string
          employee_id?: string | null
          id?: string
          sector_id?: string | null
          unit_code: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_cents?: number
          competence?: string
          created_at?: string
          created_by?: string | null
          dimension?: string
          employee_id?: string | null
          id?: string
          sector_id?: string | null
          unit_code?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_results_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_results_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_results_unit_code_fkey"
            columns: ["unit_code"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["code"]
          },
        ]
      }
      sectors: {
        Row: {
          id: string
          name: string
          unit_code: string
        }
        Insert: {
          id?: string
          name: string
          unit_code: string
        }
        Update: {
          id?: string
          name?: string
          unit_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "sectors_unit_code_fkey"
            columns: ["unit_code"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["code"]
          },
        ]
      }
      units: {
        Row: {
          address: string
          cnpj: string
          code: string
          legal_name: string
          postal_code: string
          state_registration: string
        }
        Insert: {
          address?: string
          cnpj?: string
          code: string
          legal_name?: string
          postal_code?: string
          state_registration?: string
        }
        Update: {
          address?: string
          cnpj?: string
          code?: string
          legal_name?: string
          postal_code?: string
          state_registration?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_read_all: { Args: never; Returns: boolean }
      current_unit: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved: { Args: never; Returns: boolean }
      review_employee: {
        Args: {
          _id: string
          _job: string
          _producer: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _sector: string
          _status: Database["public"]["Enums"]["access_status"]
          _unit: string
        }
        Returns: undefined
      }
    }
    Enums: {
      access_status: "pending" | "approved" | "suspended" | "rejected"
      app_role:
        | "admin"
        | "employee"
        | "director"
        | "general_manager"
        | "supervisor"
        | "producer"
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
      access_status: ["pending", "approved", "suspended", "rejected"],
      app_role: [
        "admin",
        "employee",
        "director",
        "general_manager",
        "supervisor",
        "producer",
      ],
    },
  },
} as const
