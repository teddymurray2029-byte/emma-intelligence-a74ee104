CREATE OR REPLACE FUNCTION public.match_transfer_knowledge(
  query_embedding extensions.vector,
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 5,
  p_user_id text DEFAULT ''
)
RETURNS TABLE (
  id uuid,
  user_id text,
  source_domain text,
  target_domain text,
  knowledge_type text,
  content text,
  confidence numeric,
  transfer_count int,
  created_at timestamptz,
  similarity float
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tk.id, tk.user_id, tk.source_domain, tk.target_domain,
    tk.knowledge_type, tk.content, tk.confidence, tk.transfer_count,
    tk.created_at,
    (1 - (tk.embedding OPERATOR(extensions.<=>) query_embedding))::float AS similarity
  FROM public.transfer_knowledge tk
  WHERE tk.user_id = p_user_id
    AND tk.embedding IS NOT NULL
    AND (1 - (tk.embedding OPERATOR(extensions.<=>) query_embedding))::float > match_threshold
  ORDER BY tk.embedding OPERATOR(extensions.<=>) query_embedding
  LIMIT match_count;
END;
$$;