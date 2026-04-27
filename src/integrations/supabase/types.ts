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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      admin_insights: {
        Row: {
          applied: boolean
          category: string
          created_at: string
          data: Json
          description: string
          id: string
          insight_type: string
        }
        Insert: {
          applied?: boolean
          category?: string
          created_at?: string
          data?: Json
          description: string
          id?: string
          insight_type?: string
        }
        Update: {
          applied?: boolean
          category?: string
          created_at?: string
          data?: Json
          description?: string
          id?: string
          insight_type?: string
        }
        Relationships: []
      }
      agent_installs: {
        Row: {
          id: string
          installed_at: string
          marketplace_id: string
          user_id: string
        }
        Insert: {
          id?: string
          installed_at?: string
          marketplace_id: string
          user_id: string
        }
        Update: {
          id?: string
          installed_at?: string
          marketplace_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_installs_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "agent_marketplace"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_marketplace: {
        Row: {
          author_id: string
          category: string
          created_at: string
          description: string
          id: string
          install_count: number
          manifest: Json
          name: string
          published: boolean
          rating: number
        }
        Insert: {
          author_id: string
          category?: string
          created_at?: string
          description: string
          id?: string
          install_count?: number
          manifest?: Json
          name: string
          published?: boolean
          rating?: number
        }
        Update: {
          author_id?: string
          category?: string
          created_at?: string
          description?: string
          id?: string
          install_count?: number
          manifest?: Json
          name?: string
          published?: boolean
          rating?: number
        }
        Relationships: []
      }
      agent_tools: {
        Row: {
          code: string | null
          created_at: string
          description: string
          endpoint: string | null
          id: string
          invocations: number
          name: string
          spec: Json
          status: string
          updated_at: string
          user_id: string | null
          version: number
        }
        Insert: {
          code?: string | null
          created_at?: string
          description: string
          endpoint?: string | null
          id?: string
          invocations?: number
          name: string
          spec?: Json
          status?: string
          updated_at?: string
          user_id?: string | null
          version?: number
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string
          endpoint?: string | null
          id?: string
          invocations?: number
          name?: string
          spec?: Json
          status?: string
          updated_at?: string
          user_id?: string | null
          version?: number
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      autonomous_runs: {
        Row: {
          created_at: string
          duration_ms: number | null
          goals_generated: number | null
          id: string
          quality_score: number | null
          result_summary: string | null
          safety_report: Json | null
          task_description: string
          trigger_type: string
          user_id: string
          world_model_updated: boolean | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          goals_generated?: number | null
          id?: string
          quality_score?: number | null
          result_summary?: string | null
          safety_report?: Json | null
          task_description: string
          trigger_type?: string
          user_id: string
          world_model_updated?: boolean | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          goals_generated?: number | null
          id?: string
          quality_score?: number | null
          result_summary?: string | null
          safety_report?: Json | null
          task_description?: string
          trigger_type?: string
          user_id?: string
          world_model_updated?: boolean | null
        }
        Relationships: []
      }
      benchmark_questions: {
        Row: {
          category: string
          created_at: string
          difficulty: number
          expected_answer: string | null
          id: string
          question: string
        }
        Insert: {
          category: string
          created_at?: string
          difficulty?: number
          expected_answer?: string | null
          id?: string
          question: string
        }
        Update: {
          category?: string
          created_at?: string
          difficulty?: number
          expected_answer?: string | null
          id?: string
          question?: string
        }
        Relationships: []
      }
      benchmark_runs: {
        Row: {
          category_scores: Json
          created_at: string
          id: string
          max_score: number
          model_config: Json
          system_prompt_version: number
          total_score: number
          user_id: string
        }
        Insert: {
          category_scores?: Json
          created_at?: string
          id?: string
          max_score?: number
          model_config?: Json
          system_prompt_version?: number
          total_score?: number
          user_id: string
        }
        Update: {
          category_scores?: Json
          created_at?: string
          id?: string
          max_score?: number
          model_config?: Json
          system_prompt_version?: number
          total_score?: number
          user_id?: string
        }
        Relationships: []
      }
      capability_scores: {
        Row: {
          benchmark: string
          id: string
          max_score: number
          measured_at: string
          model_config: Json
          notes: string | null
          score: number
        }
        Insert: {
          benchmark: string
          id?: string
          max_score?: number
          measured_at?: string
          model_config?: Json
          notes?: string | null
          score: number
        }
        Update: {
          benchmark?: string
          id?: string
          max_score?: number
          measured_at?: string
          model_config?: Json
          notes?: string | null
          score?: number
        }
        Relationships: []
      }
      causal_edges: {
        Row: {
          cause: string
          created_at: string
          domain: string | null
          effect: string
          evidence_count: number
          id: string
          strength: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cause: string
          created_at?: string
          domain?: string | null
          effect: string
          evidence_count?: number
          id?: string
          strength?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cause?: string
          created_at?: string
          domain?: string | null
          effect?: string
          evidence_count?: number
          id?: string
          strength?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      collective_knowledge: {
        Row: {
          created_at: string
          curated: boolean
          domain: string | null
          embedding: string | null
          id: string
          problem_pattern: string
          solution_pattern: string
          success_count: number
        }
        Insert: {
          created_at?: string
          curated?: boolean
          domain?: string | null
          embedding?: string | null
          id?: string
          problem_pattern: string
          solution_pattern: string
          success_count?: number
        }
        Update: {
          created_at?: string
          curated?: boolean
          domain?: string | null
          embedding?: string | null
          id?: string
          problem_pattern?: string
          solution_pattern?: string
          success_count?: number
        }
        Relationships: []
      }
      constitutions: {
        Row: {
          active: boolean
          created_at: string
          id: string
          rules: string
          user_id: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          rules: string
          user_id: string
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          rules?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          parent_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parent_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parent_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      defi_strategies: {
        Row: {
          approved: boolean
          chain: string
          created_at: string
          id: string
          name: string
          simulation_result: Json | null
          strategy: Json
          user_id: string
        }
        Insert: {
          approved?: boolean
          chain?: string
          created_at?: string
          id?: string
          name: string
          simulation_result?: Json | null
          strategy?: Json
          user_id: string
        }
        Update: {
          approved?: boolean
          chain?: string
          created_at?: string
          id?: string
          name?: string
          simulation_result?: Json | null
          strategy?: Json
          user_id?: string
        }
        Relationships: []
      }
      fingerprint_links: {
        Row: {
          created_at: string
          id: string
          link_type: string
          linked_fingerprint: string
          primary_fingerprint: string
        }
        Insert: {
          created_at?: string
          id?: string
          link_type?: string
          linked_fingerprint: string
          primary_fingerprint: string
        }
        Update: {
          created_at?: string
          id?: string
          link_type?: string
          linked_fingerprint?: string
          primary_fingerprint?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string
          goal_type: string
          id: string
          parent_goal_id: string | null
          priority: number
          progress: number | null
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description: string
          goal_type?: string
          id?: string
          parent_goal_id?: string | null
          priority?: number
          progress?: number | null
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string
          goal_type?: string
          id?: string
          parent_goal_id?: string | null
          priority?: number
          progress?: number | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_parent_goal_id_fkey"
            columns: ["parent_goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      improvement_logs: {
        Row: {
          accepted: boolean
          after_score: number | null
          before_score: number | null
          created_at: string
          delta: number | null
          description: string
          diff_content: string | null
          id: string
          improvement_type: string
          user_id: string
        }
        Insert: {
          accepted?: boolean
          after_score?: number | null
          before_score?: number | null
          created_at?: string
          delta?: number | null
          description: string
          diff_content?: string | null
          id?: string
          improvement_type: string
          user_id: string
        }
        Update: {
          accepted?: boolean
          after_score?: number | null
          before_score?: number | null
          created_at?: string
          delta?: number | null
          description?: string
          diff_content?: string | null
          id?: string
          improvement_type?: string
          user_id?: string
        }
        Relationships: []
      }
      learning_patterns: {
        Row: {
          applied_to_prompt_version: number | null
          confidence_score: number
          created_at: string
          frequency: number
          id: string
          pattern_data: Json
          pattern_type: string
        }
        Insert: {
          applied_to_prompt_version?: number | null
          confidence_score?: number
          created_at?: string
          frequency?: number
          id?: string
          pattern_data?: Json
          pattern_type?: string
        }
        Update: {
          applied_to_prompt_version?: number | null
          confidence_score?: number
          created_at?: string
          frequency?: number
          id?: string
          pattern_data?: Json
          pattern_type?: string
        }
        Relationships: []
      }
      memory_episodes: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          embedding_key: string | null
          episode_type: string
          id: string
          relevance_score: number | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          embedding_key?: string | null
          episode_type?: string
          id?: string
          relevance_score?: number | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          embedding_key?: string | null
          episode_type?: string
          id?: string
          relevance_score?: number | null
          user_id?: string
        }
        Relationships: []
      }
      memory_summaries: {
        Row: {
          created_at: string
          embedding: string | null
          id: string
          level: string
          range_end: string
          range_start: string
          source_episode_count: number
          summary: string
          user_id: string
        }
        Insert: {
          created_at?: string
          embedding?: string | null
          id?: string
          level: string
          range_end: string
          range_start: string
          source_episode_count?: number
          summary: string
          user_id: string
        }
        Update: {
          created_at?: string
          embedding?: string | null
          id?: string
          level?: string
          range_end?: string
          range_start?: string
          source_episode_count?: number
          summary?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      metacognitive_logs: {
        Row: {
          created_at: string
          id: string
          intervention: string | null
          loop_id: string
          metrics: Json
          phase: string
          quality_score: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          intervention?: string | null
          loop_id: string
          metrics?: Json
          phase: string
          quality_score?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          intervention?: string | null
          loop_id?: string
          metrics?: Json
          phase?: string
          quality_score?: number
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          email: string | null
          fingerprint: string | null
          id: string
          status: string
          stripe_customer_id: string | null
          stripe_session_id: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          email?: string | null
          fingerprint?: string | null
          id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_session_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          email?: string | null
          fingerprint?: string | null
          id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_session_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      plan_nodes: {
        Row: {
          action: string
          created_at: string
          depth: number
          expected_utility: number | null
          goal_id: string | null
          id: string
          parent_id: string | null
          plan_id: string
          rationale: string | null
          result: Json | null
          status: string
          user_id: string
          visit_count: number
        }
        Insert: {
          action: string
          created_at?: string
          depth?: number
          expected_utility?: number | null
          goal_id?: string | null
          id?: string
          parent_id?: string | null
          plan_id: string
          rationale?: string | null
          result?: Json | null
          status?: string
          user_id: string
          visit_count?: number
        }
        Update: {
          action?: string
          created_at?: string
          depth?: number
          expected_utility?: number | null
          goal_id?: string | null
          id?: string
          parent_id?: string | null
          plan_id?: string
          rationale?: string | null
          result?: Json | null
          status?: string
          user_id?: string
          visit_count?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          files: Json
          github_repo: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          files?: Json
          github_repo?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          files?: Json
          github_repo?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      prompt_evolutions: {
        Row: {
          active: boolean
          created_at: string
          id: string
          performance_delta: number | null
          prompt_text: string
          source_insights: Json
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          performance_delta?: number | null
          prompt_text: string
          source_insights?: Json
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          performance_delta?: number | null
          prompt_text?: string
          source_insights?: Json
          version?: number
        }
        Relationships: []
      }
      safety_verifications: {
        Row: {
          created_at: string
          formal_proofs: Json | null
          id: string
          input_hash: string | null
          passed: boolean
          risk_score: number | null
          user_id: string
          verification_type: string
          violations: Json | null
        }
        Insert: {
          created_at?: string
          formal_proofs?: Json | null
          id?: string
          input_hash?: string | null
          passed?: boolean
          risk_score?: number | null
          user_id: string
          verification_type: string
          violations?: Json | null
        }
        Update: {
          created_at?: string
          formal_proofs?: Json | null
          id?: string
          input_hash?: string | null
          passed?: boolean
          risk_score?: number | null
          user_id?: string
          verification_type?: string
          violations?: Json | null
        }
        Relationships: []
      }
      sensory_logs: {
        Row: {
          confidence: number | null
          created_at: string
          grounded_representation: Json | null
          id: string
          modality: string
          physical_properties: Json | null
          raw_input_ref: string | null
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          grounded_representation?: Json | null
          id?: string
          modality?: string
          physical_properties?: Json | null
          raw_input_ref?: string | null
          user_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          grounded_representation?: Json | null
          id?: string
          modality?: string
          physical_properties?: Json | null
          raw_input_ref?: string | null
          user_id?: string
        }
        Relationships: []
      }
      transfer_knowledge: {
        Row: {
          confidence: number | null
          content: string
          created_at: string
          embedding: string | null
          id: string
          knowledge_type: string
          source_domain: string
          target_domain: string | null
          transfer_count: number | null
          user_id: string
        }
        Insert: {
          confidence?: number | null
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          knowledge_type?: string
          source_domain: string
          target_domain?: string | null
          transfer_count?: number | null
          user_id: string
        }
        Update: {
          confidence?: number | null
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          knowledge_type?: string
          source_domain?: string
          target_domain?: string | null
          transfer_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      usage_tracking: {
        Row: {
          created_at: string
          fingerprint: string
          id: string
          ip_addresses: string[] | null
          is_paid: boolean
          messages_used: number
          stripe_customer_id: string | null
          tokens_used: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          fingerprint: string
          id?: string
          ip_addresses?: string[] | null
          is_paid?: boolean
          messages_used?: number
          stripe_customer_id?: string | null
          tokens_used?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          fingerprint?: string
          id?: string
          ip_addresses?: string[] | null
          is_paid?: boolean
          messages_used?: number
          stripe_customer_id?: string | null
          tokens_used?: number
          updated_at?: string
          user_id?: string | null
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
      world_model_states: {
        Row: {
          created_at: string
          diff: Json | null
          id: string
          state: Json
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          diff?: Json | null
          id?: string
          state?: Json
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          diff?: Json | null
          id?: string
          state?: Json
          user_id?: string
          version?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      match_transfer_knowledge: {
        Args: {
          match_count?: number
          match_threshold?: number
          p_user_id?: string
          query_embedding: string
        }
        Returns: {
          confidence: number
          content: string
          created_at: string
          id: string
          knowledge_type: string
          similarity: number
          source_domain: string
          target_domain: string
          transfer_count: number
          user_id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
