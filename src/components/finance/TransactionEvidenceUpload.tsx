import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  File,
  Image as ImageIcon,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import { firebaseStorage } from '@/src/lib/firebase';

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

export type EvidenceItem = {
  id: string;
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

const UI_COPY: Record<
  Language,
  {
    uploadFailed: string;
    addReceipt: string;
    camera: string;
    remove: string;
    ready: string;
  }
> = {
  PT: {
    uploadFailed: 'Não foi possível enviar este comprovante.',
    addReceipt: 'Adicionar comprovante',
    camera: 'Fotografar comprovante',
    remove: 'Remover comprovante',
    ready: 'Comprovante pronto',
  },
  EN: {
    uploadFailed: 'This receipt could not be uploaded.',
    addReceipt: 'Add receipt',
    camera: 'Photograph receipt',
    remove: 'Remove receipt',
    ready: 'Receipt ready',
  },
  ES: {
    uploadFailed: 'No fue posible enviar este comprobante.',
    addReceipt: 'Agregar comprobante',
    camera: 'Fotografiar comprobante',
    remove: 'Eliminar comprobante',
    ready: 'Comprobante listo',
  },
};

export function TransactionEvidenceUpload({
  organizationId,
  financeEntityId,
  evidenceIds,
  onChange,
  disabled,
}: TransactionEvidenceUploadProps) {
  const { language } = useLanguage();
  const copy = UI_COPY[language];
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const newItems = evidenceIds
      .filter((id) => !items.some((item) => item.id === id))
      .map((id) => ({
        id,
        name: id.split('/').pop() || id,
        status: 'ready' as const,
        url: id.startsWith('http') ? id : undefined,
      }));

    if (newItems.length > 0) {
      setItems((current) => [...current, ...newItems]);
    }
    // Hydration only needs to react to canonical evidence IDs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidenceIds]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;
    void handleUpload(Array.from(files));
    if (fileInputRef.current) fileInputRef.current.value = '';
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
        progress: 0,
      };

      setItems((current) => [...current, newItem]);
      const storageRef = ref(firebaseStorage, evidenceId);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setItems((current) =>
            current.map((item) =>
              item.id === evidenceId ? { ...item, progress } : item,
            ),
          );
        },
        (error) => {
          console.error('Evidence upload failed', error);
          setItems((current) =>
            current.map((item) =>
              item.id === evidenceId
                ? { ...item, status: 'error', error: copy.uploadFailed }
                : item,
            ),
          );
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setItems((current) => {
            const updated = current.map((item) =>
              item.id === evidenceId
                ? {
                    ...item,
                    status: 'ready' as const,
                    url: downloadURL,
                    progress: 100,
                  }
                : item,
            );
            onChange(
              updated.filter((item) => item.status === 'ready').map((item) => item.id),
            );
            return updated;
          });
        },
      );
    }
  };

  const handleRemove = async (id: string) => {
    if (disabled) return;
    setItems((current) => current.filter((item) => item.id !== id));
    onChange(evidenceIds.filter((evidenceId) => evidenceId !== id));

    try {
      if (id.includes('organizations/')) {
        await deleteObject(ref(firebaseStorage, id));
      }
    } catch (error) {
      console.warn('Evidence delete failed', error);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 overflow-hidden rounded-xl border border-border-subtle bg-surface-base p-3"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-text-muted">
                {item.type?.startsWith('image/') ? (
                  <ImageIcon className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <File className="h-5 w-5" aria-hidden="true" />
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-center">
                <span className="block truncate text-sm font-medium text-text-primary">
                  {item.name}
                </span>
                {item.status === 'uploading' ? (
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary">
                    <div
                      className="h-full bg-accent-primary transition-all duration-300"
                      style={{ width: `${item.progress || 0}%` }}
                    />
                  </div>
                ) : null}
                {item.status === 'error' ? (
                  <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-semantic-danger">
                    <AlertCircle className="h-3 w-3" aria-hidden="true" />
                    {item.error || copy.uploadFailed}
                  </span>
                ) : null}
                {item.status === 'ready' && item.size ? (
                  <span className="mt-0.5 text-xs text-text-muted">
                    {(item.size / 1024).toFixed(0)} KB
                  </span>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {item.status === 'uploading' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-accent-primary" aria-hidden="true" />
                ) : null}
                {item.status === 'ready' ? (
                  <CheckCircle2
                    className="h-5 w-5 text-semantic-success"
                    aria-label={copy.ready}
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleRemove(item.id)}
                  disabled={disabled}
                  aria-label={copy.remove}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-semantic-danger/10 hover:text-semantic-danger disabled:opacity-50"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {!disabled ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-border-subtle bg-surface-base text-sm font-medium text-accent-primary transition-colors hover:border-accent-primary hover:bg-surface-secondary"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            {copy.addReceipt}
          </button>
          <button
            type="button"
            aria-label={copy.camera}
            onClick={() => {
              if (!fileInputRef.current) return;
              fileInputRef.current.accept = 'image/*;capture=camera';
              fileInputRef.current.click();
              setTimeout(() => {
                if (fileInputRef.current) fileInputRef.current.accept = '*/*';
              }, 1000);
            }}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-dashed border-border-subtle bg-surface-base text-text-secondary transition-colors hover:border-accent-primary hover:bg-surface-secondary"
          >
            <Camera className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

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
