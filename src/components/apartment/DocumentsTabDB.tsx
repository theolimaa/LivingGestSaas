import { useState } from 'react';
import { Plus, Trash2, FileText, Image, Upload, X, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useDocuments, useUploadDocument, useDeleteDocument, openDocumentSigned, DocumentDB } from '@/hooks/useDocuments';
import { formatDate } from '@/lib/utils-app';
import { toast } from 'sonner';

function UploadModal({ open, onClose, tenantId }: {
  open: boolean; onClose: () => void; tenantId: string;
}) {
  const uploadDoc = useUploadDocument();
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    setFiles(prev => [...prev, ...Array.from(fileList)]);
  }

  async function handleSave() {
    for (const file of files) {
      await uploadDoc.mutateAsync({ file, tenantId });
    }
    setFiles([]);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar Documentos</DialogTitle>
        </DialogHeader>
        <div
          className={`mt-2 border-2 border-dashed rounded-xl p-8 text-center transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        >
          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">Arraste arquivos aqui</p>
          <p className="text-xs text-muted-foreground mt-1">ou</p>
          <label className="mt-2 inline-block cursor-pointer">
            <input type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
            <span className="text-sm text-primary font-medium hover:underline">Selecionar arquivos</span>
          </label>
          <p className="text-xs text-muted-foreground mt-2">PDF, JPG, PNG</p>
        </div>
        {files.length > 0 && (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                {f.type.includes('pdf') ? <FileText className="w-4 h-4 text-primary" /> : <Image className="w-4 h-4 text-primary" />}
                <span className="text-sm truncate flex-1">{f.name}</span>
                <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                <button onClick={() => setFiles(files.filter((_, j) => j !== i))}><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={files.length === 0 || uploadDoc.isPending}>
            {uploadDoc.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Salvar ({files.length} arquivo{files.length !== 1 ? 's' : ''})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DocumentsTabDB({ tenantId }: { tenantId: string }) {
  const { data: documents = [], isLoading } = useDocuments(tenantId);
  const deleteDoc = useDeleteDocument();
  const [showUpload, setShowUpload] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DocumentDB | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  async function handleOpen(doc: DocumentDB) {
    setOpeningId(doc.id);
    try {
      await openDocumentSigned(doc.file_url);
    } catch {
      toast.error('Não foi possível abrir o documento.');
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Documentos</h3>
          <p className="text-sm text-muted-foreground">{documents.length} arquivo(s)</p>
        </div>
        <Button size="sm" onClick={() => setShowUpload(true)}>
          <Plus className="w-4 h-4 mr-2" /> Adicionar
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : documents.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-10 text-center">
          <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">Nenhum documento cadastrado</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowUpload(true)}>
            <Upload className="w-4 h-4 mr-2" /> Fazer upload
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl hover:bg-muted/50 transition-colors">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${doc.file_type === 'pdf' ? 'bg-red-50' : 'bg-blue-50'}`}>
                {doc.file_type === 'pdf'
                  ? <FileText className="w-4 h-4 text-red-500" />
                  : <Image className="w-4 h-4 text-blue-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => handleOpen(doc)}
                  disabled={openingId === doc.id}
                  className="text-sm font-medium truncate hover:text-primary hover:underline block text-left w-full disabled:opacity-60"
                >
                  {openingId === doc.id
                    ? <span className="flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" />{doc.file_name}</span>
                    : <span className="flex items-center gap-1.5">{doc.file_name}<ExternalLink className="w-3 h-3 opacity-40 inline-block" /></span>
                  }
                </button>
                <p className="text-xs text-muted-foreground">{formatDate(doc.uploaded_at)}</p>
              </div>
              <button
                onClick={() => setDeleteTarget(doc)}
                className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} tenantId={tenantId} />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Documento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.file_name}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteDoc.mutate({
                  id: deleteTarget!.id,
                  tenantId,
                  fileUrl: deleteTarget!.file_url,
                });
                setDeleteTarget(null);
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
