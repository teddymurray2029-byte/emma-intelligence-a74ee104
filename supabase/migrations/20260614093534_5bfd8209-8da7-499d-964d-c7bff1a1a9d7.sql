
CREATE POLICY "chat_uploads_insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'chat-uploads');
CREATE POLICY "chat_uploads_select" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'chat-uploads');
CREATE POLICY "chat_uploads_update" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'chat-uploads') WITH CHECK (bucket_id = 'chat-uploads');
CREATE POLICY "chat_uploads_delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'chat-uploads');
