import { useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import JSZip from "jszip";

interface FileUploadProps {
  userId: string;
  onFileUploaded: (url: string, fileName: string) => void;
  onZipExtracted?: (files: { path: string; content: string }[]) => void;
  disabled?: boolean;
  children: React.ReactNode;
}

export function FileUpload({ userId, onFileUploaded, onZipExtracted, disabled, children }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const extractZip = useCallback(async (file: File) => {
    try {
      const zip = await JSZip.loadAsync(file);
      const extracted: { path: string; content: string }[] = [];
      const promises: Promise<void>[] = [];
      zip.forEach((relativePath, entry) => {
        if (entry.dir || relativePath.startsWith("__MACOSX") || relativePath.startsWith(".")) return;
        promises.push(entry.async("string").then((content) => { extracted.push({ path: relativePath, content }); }));
      });
      await Promise.all(promises);
      if (onZipExtracted) {
        onZipExtracted(extracted);
        toast.success(`Extracted ${extracted.length} files from ${file.name}`);
      }
    } catch (e: any) {
      toast.error("ZIP extraction failed: " + e.message);
    }
  }, [onZipExtracted]);

  const upload = useCallback(async (file: File) => {
    // Handle ZIP files
    if (file.name.endsWith(".zip")) {
      await extractZip(file);
      return;
    }

    const ext = file.name.split(".").pop();
    const path = `${userId}/${crypto.randomUUID?.() || Date.now()}.${ext}`;

    const { error } = await supabase.storage.from("chat-uploads").upload(path, file);
    if (error) {
      toast.error("Upload failed: " + error.message);
      return;
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from("chat-uploads")
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (signErr || !signed) {
      toast.error("Could not get file URL: " + (signErr?.message || "unknown"));
      return;
    }
    onFileUploaded(signed.signedUrl, file.name);
  }, [userId, onFileUploaded, extractZip]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    e.target.value = "";
  };

  return (
    <>
      <input ref={inputRef} type="file" className="hidden" onChange={handleChange} accept="image/*,.pdf,.txt,.md,.csv,.json,.zip" />
      <div onClick={() => !disabled && inputRef.current?.click()}>
        {children}
      </div>
    </>
  );
}
