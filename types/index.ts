/** Tipos compartidos del cliente. Coinciden con las colecciones de Firestore. */
export type Role = "user" | "moderator" | "admin" | "waiter";
export interface Ts { seconds: number }
export interface Profile { uid: string; name: string; email: string; role: Role; photoURL: string; photoPublicId: string; status: "active" | "disabled"; createdAt?: Ts; lastLoginAt?: Ts }
export interface Post { id: string; authorId: string; authorName: string; title: string; content: string; imageUrl: string; imagePublicId: string; status: string; createdAt?: Ts }
export interface Comment { id: string; postId: string; authorId: string; authorName: string; content: string; status: string; createdAt?: Ts }
export interface Review { id: string; authorId: string; authorName: string; rating: number; product: string; productId?: string; content: string; status: string; createdAt?: Ts; lastReviewedAt?: Ts }
export interface MenuItem { id: string; name: string; description: string; category: string; size: string; price: number; imageUrl: string; available: boolean }
export interface Promotion { id: string; title: string; description: string; imageUrl: string; discount: number; startDate: string; endDate: string; active: boolean }
export const CATEGORIES = ["Café", "Bebidas", "Té", "Postres", "Alimentos"] as const;
export interface Log { id: string; userId: string; userName: string; userRole: string; action: string; module: string; targetType: string; targetId: string; status: string; description: string; timestamp?: Ts }
export interface ItemTicket { productId: string; name: string }
export interface Ticket { id: string; code: string; waiterId: string; waiterName: string; consumedAt: Ts; items: ItemTicket[]; people: number; maxUses: number; uses: number; status: string; expiresAt: Ts; createdAt?: Ts }
export interface Claim { id: string; ticketCode: string; userId: string; userName: string; consumedAt: Ts; claimedAt?: Ts; items: ItemTicket[]; people: number }