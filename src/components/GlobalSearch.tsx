import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, DoorOpen, Search, User } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useCondominiums } from '@/hooks/useCondominiums';
import { useApartments } from '@/hooks/useApartments';
import { useTenants } from '@/hooks/useTenants';

/** Busca global (Ctrl/⌘+K): condomínios, apartamentos e inquilinos. */
export default function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const { data: condos = [] } = useCondominiums();
  const { data: apartments = [] } = useApartments();
  const { data: tenants = [] } = useTenants();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const condoName = useMemo(() => new Map(condos.map(c => [c.id, c.name])), [condos]);
  const activeTenants = useMemo(() => tenants.filter(t => !t.archived_at), [tenants]);
  const aptById = useMemo(() => new Map(apartments.map(a => [a.id, a])), [apartments]);

  function go(path: string) {
    onOpenChange(false);
    navigate(path);
  }

  const q = query.trim().length > 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar condomínio, apartamento ou inquilino…" value={query} onValueChange={setQuery} />
      <CommandList className="max-h-[60dvh]">
        <CommandEmpty>Nada encontrado.</CommandEmpty>
        {q && (
          <>
            <CommandGroup heading="Inquilinos">
              {activeTenants.slice(0, 200).map(t => {
                const apt = aptById.get(t.apartment_id);
                const name = `${t.first_name} ${t.last_name}`;
                return (
                  <CommandItem
                    key={t.id}
                    value={`${name} ${apt?.unit_number ?? ''} ${condoName.get(apt?.condominium_id ?? '') ?? ''}`}
                    onSelect={() => apt && go(`/apartments/${apt.id}`)}
                  >
                    <User className="mr-2 w-4 h-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{name}</span>
                    <span className="text-xs text-muted-foreground truncate ml-2">
                      {condoName.get(apt?.condominium_id ?? '')} · {apt?.unit_number}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandGroup heading="Apartamentos">
              {apartments.slice(0, 300).map(a => (
                <CommandItem
                  key={a.id}
                  value={`apartamento ${a.unit_number} ${condoName.get(a.condominium_id) ?? ''}`}
                  onSelect={() => go(`/apartments/${a.id}`)}
                >
                  <DoorOpen className="mr-2 w-4 h-4 text-muted-foreground" />
                  <span className="flex-1">{a.unit_number}</span>
                  <span className="text-xs text-muted-foreground truncate ml-2">{condoName.get(a.condominium_id)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        <CommandGroup heading="Condomínios">
          {condos.map(c => (
            <CommandItem key={c.id} value={`condomínio ${c.name}`} onSelect={() => go(`/condominiums/${c.id}`)}>
              <Building2 className="mr-2 w-4 h-4 text-muted-foreground" />
              {c.name}
            </CommandItem>
          ))}
        </CommandGroup>
        {!q && (
          <p className="px-4 py-3 text-xs text-muted-foreground flex items-center gap-1.5">
            <Search className="w-3 h-3" /> Digite um nome ou número de apartamento
          </p>
        )}
      </CommandList>
    </CommandDialog>
  );
}
