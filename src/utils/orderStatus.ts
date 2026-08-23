import { Order } from '../types';

/**
 * Etiqueta legible del estado de un pedido (flujo tipo Rappi).
 * Para 'listo' el texto depende de la modalidad: en envío es "Listo",
 * en retiro es "Listo para retirar".
 */
export function orderStatusLabel(status: Order['status'], delivery?: Order['delivery']): string {
  switch (status) {
    case 'pending_confirmation': return 'Programado';
    case 'pendiente': return 'Recibido';
    case 'confirmado': return 'Confirmado';
    case 'en_preparacion': return 'En preparación';
    case 'en_camino': return 'En camino';
    case 'listo': return delivery === 'envio' ? 'Listo' : 'Listo para retirar';
    case 'entregado': return 'Entregado';
    case 'cancelado': return 'Cancelado';
    default: return status;
  }
}

/**
 * Paso (0-4) del pedido en la barra de seguimiento del cliente.
 * Envío:  Recibido → Confirmado → En preparación → En camino → Entregado
 * Retiro: Recibido → Confirmado → En preparación → Listo     → Entregado
 */
export function orderStatusStep(status: Order['status']): number {
  switch (status) {
    case 'pending_confirmation':
    case 'pendiente': return 0;
    case 'confirmado': return 1;
    case 'en_preparacion': return 2;
    case 'en_camino':
    case 'listo': return 3;
    case 'entregado': return 4;
    default: return 0;
  }
}
