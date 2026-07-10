import React, { useState, useRef, useEffect } from "react";
import { Upload, X, File, Image as ImageIcon, CheckCircle2, Loader2, Camera, Link as LinkIcon, AlertCircle } from "lucide-react";
import { firebaseStorage, firebaseAuth } from "@/src/lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { useAuth } from "@/src/hooks/useAuth";

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
}

export type EvidenceItem = {
  id: string; // The canonical ID (can be storage path or UUID)
  url?: string;
  name: string;
  size?: number;
  type?: string;
  status: 'uploading' | 'ready' | 'error';
  progress?: number;
  error?: string;
};

interface TransactionEvidenceUploadProps {
  organizationId: string;
  financeEntityId: string;
  evidenceIds: string[];
  onChange: (evidenceIds: string[]) => void;
  disabled?: boolean;
}

export function TransactionEvidenceUpload({
  organizationId,
  financeEntityId,
  evidenceIds,
  onChange,
  disabled
}: TransactionEvidenceUploadProps) {
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Initialize items from evidenceIds (hydrate)
  useEffect(() => {
    // If evidenceIds has items not in our state, add them
    const newItems = evidenceIds.filter(id => !items.some(item => item.id === id)).map(id => {
      // Very basic hydration: we just assume they are ready if they exist in the model
      return {
        id,
        name: id.split('/').pop() || id,
        status: 'ready' as const,
        url: id.startsWith('http') ? id : undefined // Normally we'd fetch the download URL here, but keeping it simple
      };
    });
    
    if (newItems.length > 0) {
      setItems(prev => [...prev, ...newItems]);
    }
  }, [evidenceIds]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    handleUpload(Array.from(files));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async (files: File[]) => {
    for (const file of files) {
      const evidenceId = `organizations/${organizationId}/financeEntities/${financeEntityId}/evidence/${generateId()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      
      const newItem: EvidenceItem = {
        id: evidenceId,
        name: file.name,
        size: file.size,
        type: file.type,
        status: 'uploading',
        progress: 0
      };
      
      setItems(prev => [...prev, newItem]);
      
      const storageRef = ref(firebaseStorage, evidenceId);
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setItems(prev => prev.map(item => 
            item.id === evidenceId ? { ...item, progress } : item
          ));
        },
        (error) => {
          console.error("Upload failed", error);
          setItems(prev => prev.map(item => 
            item.id === evidenceId ? { ...item, status: 'error', error: 'Falha no upload' } : item
          ));
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setItems(prev => {
            const updated = prev.map(item => 
              item.id === evidenceId ? { ...item, status: 'ready', url: downloadURL, progress: 100 } : item
            );
            // Append to parent when ready
            const readyIds = updated.filter(i => i.status === 'ready').map(i => i.id);
            onChange(readyIds);
            return updated;
          });
        }
      );
    }
  };

  const handleRemove = async (id: string) => {
    if (disabled) return;
    
    // Optimistic UI update
    setItems(prev => prev.filter(item => item.id !== id));
    onChange(evidenceIds.filter(e => e !== id));
    
    try {
       // Only delete if it's a storage path
       if (id.includes('organizations/')) {
         const storageRef = ref(firebaseStorage, id);
         await deleteObject(storageRef);
       }
    } catch (e) {
       console.warn("Failed to delete object", e);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 p-3 bg-surface-base border border-border-subtle rounded-xl overflow-hidden">
              <div className="w-10 h-10 shrink-0 bg-surface-secondary rounded-lg flex items-center justify-center text-text-muted">
                {item.type?.startsWith('image/') ? <ImageIcon className="w-5 h-5" /> : <File className="w-5 h-5" />}
              </div>
              
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <span className="text-sm font-medium text-text-primary truncate block">
                  {item.name}
                </span>
                
                {item.status === 'uploading' && (
                  <div className="w-full h-1.5 bg-surface-secondary rounded-full mt-1.5 overflow-hidden">
                    <div 
                      className="h-full bg-accent-primary transition-all duration-300"
                      style={{ width: `${item.progress || 0}%` }}
                    />
                  </div>
                )}
                {item.status === 'error' && (
                  <span className="text-xs text-rose-500 font-medium mt-0.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {item.error}
                  </span>
                )}
                {item.status === 'ready' && item.size && (
                  <span className="text-xs text-text-muted mt-0.5">
                    {(item.size / 1024).toFixed(0)} KB
                  </span>
                )}
              </div>
              
              <div className="shrink-0 flex items-center gap-2">
                {item.status === 'uploading' && <Loader2 className="w-4 h-4 text-accent-primary animate-spin" />}
                {item.status === 'ready' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                <button 
                  type="button"
                  onClick={() => handleRemove(item.id)}
                  disabled={disabled}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:bg-rose-50 hover:text-rose-600 transition-colors disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 h-12 flex items-center justify-center gap-2 bg-surface-base border border-border-subtle border-dashed hover:border-accent-primary hover:bg-surface-secondary text-accent-primary rounded-xl font-medium transition-colors text-sm"
          >
            <Upload className="w-4 h-4" />
            Adicionar comprovante
          </button>
          
          <button
            type="button"
            onClick={() => {
              // Simulating camera by just opening file picker with accept image
              if (fileInputRef.current) {
                fileInputRef.current.accept = "image/*;capture=camera";
                fileInputRef.current.click();
                setTimeout(() => {
                   if (fileInputRef.current) fileInputRef.current.accept = "*/*";
                }, 1000);
              }
            }}
            className="h-12 w-12 flex shrink-0 items-center justify-center bg-surface-base border border-border-subtle border-dashed hover:border-accent-primary hover:bg-surface-secondary text-text-secondary rounded-xl font-medium transition-colors"
          >
            <Camera className="w-5 h-5" />
          </button>
        </div>
      )}
      
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        multiple 
      />
    </div>
  );
}
