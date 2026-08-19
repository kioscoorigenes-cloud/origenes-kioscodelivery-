import { useEffect, useRef, type ReactNode } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

interface ModalProps {
  /** Cierra el modal: lo llama Escape y el click en el fondo. */
  onClose: () => void;
  /** id del titulo que nombra al dialogo (preferido sobre `label`). */
  labelledBy?: string;
  /** Nombre accesible cuando no hay un titulo visible al que apuntar. */
  label?: string;
  /** Clases del backdrop. Se pasan tal cual para no alterar el layout existente. */
  className?: string;
  id?: string;
  /** Algunos dialogos de confirmacion no deben cerrarse tocando el fondo. */
  closeOnBackdrop?: boolean;
  children: ReactNode;
}

/**
 * Contenedor accesible para los overlays de la app.
 *
 * Aporta role="dialog" + aria-modal, mueve el foco al abrir, lo mantiene
 * adentro mientras esta abierto (focus trap con Tab / Shift+Tab), lo devuelve
 * al elemento que lo abrio al cerrar, y cierra con Escape o click en el fondo.
 *
 * Renderiza un unico div con las clases que recibe, asi reemplazar el div del
 * backdrop por <Modal> no cambia nada del layout.
 */
export function Modal({
  onClose,
  labelledBy,
  label,
  className,
  id,
  closeOnBackdrop = true,
  children
}: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Foco al abrir y restauracion al cerrar.
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // Se enfoca el contenedor y no el primer campo: en el celular, enfocar un
    // input levanta el teclado apenas se abre el dialogo.
    ref.current?.focus();

    return () => {
      const prev = previouslyFocused.current;
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        prev.focus();
      }
    };
  }, []);

  // Escape para cerrar + focus trap.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== 'Tab') return;

      const node = ref.current;
      if (!node) return;

      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement);

      if (items.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (!node.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      ref={ref}
      id={id}
      className={className}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      tabIndex={-1}
      // mousedown y no click: evita que arrastrar desde adentro y soltar sobre
      // el fondo cierre el dialogo por accidente.
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}
