export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      cloud_saves: {
        Row: {
          actions: Json
          config: Json
          round: number
          saved_at: string
          schema_version: number
          slot_id: string
          user_id: string
        }
        Insert: {
          actions: Json
          config: Json
          round: number
          saved_at?: string
          schema_version: number
          slot_id: string
          user_id: string
        }
        Update: {
          actions?: Json
          config?: Json
          round?: number
          saved_at?: string
          schema_version?: number
          slot_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'cloud_saves_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      entitlements: {
        Row: {
          granted_at: string
          key: string
          source: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          key: string
          source: string
          user_id: string
        }
        Update: {
          granted_at?: string
          key?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'entitlements_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      match_actions: {
        Row: {
          action: Json
          created_at: string
          match_id: string
          seat: number
          seq: number
        }
        Insert: {
          action: Json
          created_at?: string
          match_id: string
          seat: number
          seq: number
        }
        Update: {
          action?: Json
          created_at?: string
          match_id?: string
          seat?: number
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: 'match_actions_match_id_fkey'
            columns: ['match_id']
            isOneToOne: false
            referencedRelation: 'matches'
            referencedColumns: ['id']
          },
        ]
      }
      match_chat: {
        Row: {
          alliance_id: number | null
          body: string
          channel: string
          created_at: string
          id: number
          match_id: string
          seat: number
        }
        Insert: {
          alliance_id?: number | null
          body: string
          channel: string
          created_at?: string
          id?: never
          match_id: string
          seat: number
        }
        Update: {
          alliance_id?: number | null
          body?: string
          channel?: string
          created_at?: string
          id?: never
          match_id?: string
          seat?: number
        }
        Relationships: [
          {
            foreignKeyName: 'match_chat_match_id_fkey'
            columns: ['match_id']
            isOneToOne: false
            referencedRelation: 'matches'
            referencedColumns: ['id']
          },
        ]
      }
      match_players: {
        Row: {
          alliance_id: number | null
          faction: string
          last_seen_at: string | null
          match_id: string
          missed_turns: number
          seat: number
          status: string
          user_id: string | null
        }
        Insert: {
          alliance_id?: number | null
          faction: string
          last_seen_at?: string | null
          match_id: string
          missed_turns?: number
          seat: number
          status: string
          user_id?: string | null
        }
        Update: {
          alliance_id?: number | null
          faction?: string
          last_seen_at?: string | null
          match_id?: string
          missed_turns?: number
          seat?: number
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'match_players_match_id_fkey'
            columns: ['match_id']
            isOneToOne: false
            referencedRelation: 'matches'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'match_players_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      match_snapshots: {
        Row: {
          match_id: string
          seq: number
          state: Json
        }
        Insert: {
          match_id: string
          seq: number
          state: Json
        }
        Update: {
          match_id?: string
          seq?: number
          state?: Json
        }
        Relationships: [
          {
            foreignKeyName: 'match_snapshots_match_id_fkey'
            columns: ['match_id']
            isOneToOne: false
            referencedRelation: 'matches'
            referencedColumns: ['id']
          },
        ]
      }
      match_spectators: {
        Row: {
          created_at: string
          granted_by: string
          match_id: string
          user_id: string
          viewing_seat: number
        }
        Insert: {
          created_at?: string
          granted_by: string
          match_id: string
          user_id: string
          viewing_seat: number
        }
        Update: {
          created_at?: string
          granted_by?: string
          match_id?: string
          user_id?: string
          viewing_seat?: number
        }
        Relationships: [
          {
            foreignKeyName: 'match_spectators_granted_by_fkey'
            columns: ['granted_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'match_spectators_match_id_fkey'
            columns: ['match_id']
            isOneToOne: false
            referencedRelation: 'matches'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'match_spectators_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      matches: {
        Row: {
          action_count: number
          created_at: string
          created_by: string
          engine_version: string
          id: string
          invite_code: string | null
          seed: number
          settings: Json
          status: string
          turn_deadline: string | null
          updated_at: string
          winner_seat: number | null
        }
        Insert: {
          action_count?: number
          created_at?: string
          created_by: string
          engine_version: string
          id?: string
          invite_code?: string | null
          seed: number
          settings: Json
          status: string
          turn_deadline?: string | null
          updated_at?: string
          winner_seat?: number | null
        }
        Update: {
          action_count?: number
          created_at?: string
          created_by?: string
          engine_version?: string
          id?: string
          invite_code?: string | null
          seed?: number
          settings?: Json
          status?: string
          turn_deadline?: string | null
          updated_at?: string
          winner_seat?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'matches_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      matchmaking_queue: {
        Row: {
          faction: string | null
          map_size: string
          match_size: number
          queued_at: string
          user_id: string
        }
        Insert: {
          faction?: string | null
          map_size: string
          match_size: number
          queued_at?: string
          user_id: string
        }
        Update: {
          faction?: string | null
          map_size?: string
          match_size?: number
          queued_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'matchmaking_queue_user_id_fkey'
            columns: ['user_id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      player_ratings: {
        Row: {
          created_at: string
          matches_played: number
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          matches_played?: number
          rating?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          matches_played?: number
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'player_ratings_user_id_fkey'
            columns: ['user_id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_guest: boolean
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
          is_guest?: boolean
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_guest?: boolean
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_matchmaking_group: {
        Args: { p_map_size: string; p_match_size: number }
        Returns: {
          faction: string
          user_id: string
        }[]
      }
      finalize_match_with_ratings: {
        Args: { p_match_id: string; p_ratings: Json; p_winner_seat: number | null }
        Returns: boolean
      }
      match_seed: { Args: { p_match_id: string }; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
