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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      apartments: {
        Row: {
          condominium_id: string
          created_at: string | null
          id: string
          unit_number: string
        }
        Insert: {
          condominium_id: string
          created_at?: string | null
          id?: string
          unit_number: string
        }
        Update: {
          condominium_id?: string
          created_at?: string | null
          id?: string
          unit_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "apartments_condominium_id_fkey"
            columns: ["condominium_id"]
            isOneToOne: false
            referencedRelation: "condominiums"
            referencedColumns: ["id"]
          },
        ]
      }
      company_financial_summary: {
        Row: {
          condominium_id: string | null
          created_at: string | null
          default_rate: number | null
          id: string
          month: string
          occupancy_rate: number | null
          occupied_apartments: number | null
          total_apartments: number | null
          total_expected_rent: number | null
          total_overdue_rent: number | null
          total_paid_rent: number | null
          total_vacant_loss: number | null
          updated_at: string | null
          vacant_apartments: number | null
          year: number
        }
        Insert: {
          condominium_id?: string | null
          created_at?: string | null
          default_rate?: number | null
          id?: string
          month: string
          occupancy_rate?: number | null
          occupied_apartments?: number | null
          total_apartments?: number | null
          total_expected_rent?: number | null
          total_overdue_rent?: number | null
          total_paid_rent?: number | null
          total_vacant_loss?: number | null
          updated_at?: string | null
          vacant_apartments?: number | null
          year: number
        }
        Update: {
          condominium_id?: string | null
          created_at?: string | null
          default_rate?: number | null
          id?: string
          month?: string
          occupancy_rate?: number | null
          occupied_apartments?: number | null
          total_apartments?: number | null
          total_expected_rent?: number | null
          total_overdue_rent?: number | null
          total_paid_rent?: number | null
          total_vacant_loss?: number | null
          updated_at?: string | null
          vacant_apartments?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_financial_summary_condominium_id_fkey"
            columns: ["condominium_id"]
            isOneToOne: false
            referencedRelation: "condominiums"
            referencedColumns: ["id"]
          },
        ]
      }
      condominiums: {
        Row: {
          created_at: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      contracts: {
        Row: {
          caution_date: string | null
          caution_paid: boolean | null
          caution_value: number | null
          created_at: string
          desired_payment_date: string | null
          desired_payment_day: number | null
          end_date: string | null
          id: string
          observations: string | null
          payment_day: number | null
          rent_value: number
          start_date: string
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          caution_date?: string | null
          caution_paid?: boolean | null
          caution_value?: number | null
          created_at?: string
          desired_payment_date?: string | null
          desired_payment_day?: number | null
          end_date?: string | null
          id?: string
          observations?: string | null
          payment_day?: number | null
          rent_value: number
          start_date: string
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          caution_date?: string | null
          caution_paid?: boolean | null
          caution_value?: number | null
          created_at?: string
          desired_payment_date?: string | null
          desired_payment_day?: number | null
          end_date?: string | null
          id?: string
          observations?: string | null
          payment_day?: number | null
          rent_value?: number
          start_date?: string
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      debt_agreements: {
        Row: {
          agreed_amount: number
          apartment_id: string | null
          created_at: string | null
          id: string
          installment_count: number
          installment_value: number
          notes: string | null
          original_amount: number
          previous_tenant_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          agreed_amount: number
          apartment_id?: string | null
          created_at?: string | null
          id?: string
          installment_count?: number
          installment_value: number
          notes?: string | null
          original_amount: number
          previous_tenant_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          agreed_amount?: number
          apartment_id?: string | null
          created_at?: string | null
          id?: string
          installment_count?: number
          installment_value?: number
          notes?: string | null
          original_amount?: number
          previous_tenant_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debt_agreements_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "apartments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_agreements_previous_tenant_id_fkey"
            columns: ["previous_tenant_id"]
            isOneToOne: false
            referencedRelation: "previous_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      debt_installments: {
        Row: {
          agreement_id: string | null
          amount: number
          created_at: string | null
          due_date: string | null
          id: string
          installment_number: number
          notes: string | null
          paid: boolean | null
          payment_date: string | null
          payment_method: string | null
        }
        Insert: {
          agreement_id?: string | null
          amount: number
          created_at?: string | null
          due_date?: string | null
          id?: string
          installment_number: number
          notes?: string | null
          paid?: boolean | null
          payment_date?: string | null
          payment_method?: string | null
        }
        Update: {
          agreement_id?: string | null
          amount?: number
          created_at?: string | null
          due_date?: string | null
          id?: string
          installment_number?: number
          notes?: string | null
          paid?: boolean | null
          payment_date?: string | null
          payment_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debt_installments_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "debt_agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          file_name: string
          file_type: string | null
          file_url: string
          id: string
          tenant_id: string
          uploaded_at: string
        }
        Insert: {
          file_name: string
          file_type?: string | null
          file_url: string
          id?: string
          tenant_id: string
          uploaded_at?: string
        }
        Update: {
          file_name?: string
          file_type?: string | null
          file_url?: string
          id?: string
          tenant_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_records: {
        Row: {
          apartment_id: string
          contract_id: string | null
          created_at: string | null
          debt_paid_amount: number | null
          debt_payment_date: string | null
          debt_payment_method: string | null
          id: string
          month: string
          observations: string | null
          paid: boolean | null
          paid_amount: number | null
          payment_date: string | null
          payment_method: string | null
          receipt_generated_at: string | null
          receipt_number: string | null
          rent_value: number
          status: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          apartment_id: string
          contract_id?: string | null
          created_at?: string | null
          debt_paid_amount?: number | null
          debt_payment_date?: string | null
          debt_payment_method?: string | null
          id?: string
          month: string
          observations?: string | null
          paid?: boolean | null
          paid_amount?: number | null
          payment_date?: string | null
          payment_method?: string | null
          receipt_generated_at?: string | null
          receipt_number?: string | null
          rent_value?: number
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          apartment_id?: string
          contract_id?: string | null
          created_at?: string | null
          debt_paid_amount?: number | null
          debt_payment_date?: string | null
          debt_payment_method?: string | null
          id?: string
          month?: string
          observations?: string | null
          paid?: boolean | null
          paid_amount?: number | null
          payment_date?: string | null
          payment_method?: string | null
          receipt_generated_at?: string | null
          receipt_number?: string | null
          rent_value?: number
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_records_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "apartments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_records_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      previous_tenants: {
        Row: {
          apartment_id: string | null
          archived_at: string | null
          birth_date: string | null
          cpf: string | null
          created_at: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          original_id: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          apartment_id?: string | null
          archived_at?: string | null
          birth_date?: string | null
          cpf?: string | null
          created_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          original_id?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          apartment_id?: string | null
          archived_at?: string | null
          birth_date?: string | null
          cpf?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          original_id?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      residents: {
        Row: {
          cpf: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          relationship: string | null
          surname: string | null
          tenant_id: string
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          relationship?: string | null
          surname?: string | null
          tenant_id: string
        }
        Update: {
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          relationship?: string | null
          surname?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "residents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_receipts: {
        Row: {
          apartment_id: string
          apartment_unit: string
          condominium_name: string
          contract_id: string | null
          financial_record_id: string
          id: string
          month: string
          payment_date: string | null
          public_url: string
          receipt_code: string
          saved_at: string | null
          storage_path: string
          tenant_id: string | null
          tenant_name: string
          user_id: string
        }
        Insert: {
          apartment_id: string
          apartment_unit: string
          condominium_name: string
          contract_id?: string | null
          financial_record_id: string
          id?: string
          month: string
          payment_date?: string | null
          public_url: string
          receipt_code: string
          saved_at?: string | null
          storage_path: string
          tenant_id?: string | null
          tenant_name: string
          user_id: string
        }
        Update: {
          apartment_id?: string
          apartment_unit?: string
          condominium_name?: string
          contract_id?: string | null
          financial_record_id?: string
          id?: string
          month?: string
          payment_date?: string | null
          public_url?: string
          receipt_code?: string
          saved_at?: string | null
          storage_path?: string
          tenant_id?: string | null
          tenant_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_receipts_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "apartments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_receipts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_receipts_financial_record_id_fkey"
            columns: ["financial_record_id"]
            isOneToOne: false
            referencedRelation: "financial_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          apartment_id: string
          archived_at: string | null
          birth_date: string | null
          cpf: string | null
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          apartment_id: string
          archived_at?: string | null
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          apartment_id?: string
          archived_at?: string | null
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "apartments"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          id: string
          updated_at: string | null
          username: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
