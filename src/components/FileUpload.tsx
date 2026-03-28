import { useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface FileUploadProps {
  userId: string;
  onFileUploaded: (url: string, fileName: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}

export function FileUpload({ userId, onFileUploaded, disabled, children }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (file: File) => {
    const ext = file.name.split(".").pop();
    const path = `${userId}/${crypto.randomUUID?.() || Date.now()}.${ext}`;

    const { error } = await supabase.storage.from("chat-uploads").upload(path, file);
    if (error) {
      toast.error("Upload failed: " + error.message);
      return;
    }

    const { data } = supabase.storage.from("chat-uploads").getPublicUrl(path);
    onFileUploaded(data.publicUrl, file.name);
  }, [userId, onFileUploaded]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    e.target.value = "";
  };

  return (
    <>
      <input ref={inputRef} type="file" className="hidden" onChange={handleChange} accept="image/*,.pdf,.txt,.md,.csv,.json" />
      <div onClick={() => !disabled && inputRef.current?.click()}>
        {children}
      </div>
    </>
  );
}
