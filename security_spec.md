# Security Specification: Orígenes Kiosco Firestore Rules

## 1. Data Invariants

1. **Products Invariance**:
   - Only authorized administrators can create, update, or delete products.
   - A product must always have a valid, non-empty `name` (max 100 chars), `cat` (must be an approved category), `price` (greater than 0), and `inStock` boolean field.
   - The product ID is modeled as both a Firestore document ID and a matching numeric `id` field.

2. **Orders Invariance**:
   - Any user (customers in the storefront) can create an order.
   - Reverting/deleting an order is NOT allowed by any client (even administrators must transition them to "cancelado", order deletion from the SDK is forbidden).
   - Only administrators with verified accounts can update an order's status (e.g. from `pendiente` to `confirmado` / `entregado`).
   - The `status` field transition is unidirectional once it reaches a terminal state (e.g., once status is `cancelado` or `entregado`, it cannot be reopened).
   - Timestamp must match the exact server-verified time `request.time`.

---

## 2. The "Dirty Dozen" Malicious Payloads (TDD)

We test the security boundaries with these 12 simulated payloads. They must all return `PERMISSION_DENIED`:

1. **Write product as anonymous client**: Attempt to create a document in `/products` without admin privileges.
2. **Set product price to negative**: Attempt to upload a product with `price: -10`.
3. **Set product status of non-existent field**: Inject a ghost field like `isHotPromo: true` or `bypassedAdmin: true` to a product.
4. **Spoof author identity on product creation**: Set admin claims on client state to bypass security.
5. **Delete a product as unauthenticated**: Try to send a delete query to `/products/{productId}` anonymously.
6. **Insert order with arbitrary status**: Attempt to create a new order directly marked as `status: 'entregado'` (bypassing admin confirmation).
7. **Client alters total calculation**: Inject a lower total on write: payload has items worth $10000 but sets `total: 100` in the database.
8. **Delete order as customer**: Try to delete a placed order.
9. **Update someone else's order status**: Attempt to change the `status` of order `1001` on another customer session.
10. **Spoof server timestamp**: Send an order with a pre-dated `timestamp` ("1999-01-01T00:00:00Z") to corrupt analytics.
11. **Inject oversized fields**: Write client name as a 2MB binary string to trigger storage-based wallet exhaustion attacks.
12. **Malicious ID Injection**: Write to products or orders container paths using invalid ID characters (e.g. inject path-traversal strings like `../../malicious_location`).

---

## 3. Test Cases Draft

```ts
// firestore.rules.test.ts

describe("Orígenes Kiosco Firestore Security Rules", () => {
  it("should block unauthenticated writes to products", async () => {
    // Expect write payload 1 to fail
  });

  it("should prevent non-admins from patching product lists", async () => {
    // Expect status modifications to fail
  });

  it("should allow public reading of products", async () => {
    // Expect list/get on products to succeed
  });

  it("should allow any customer to submit (create) a pending order", async () => {
    // Expect order creation from checkout to succeed
  });

  it("should strictly block everyone from deleting or overwriting placed orders", async () => {
    // Expect order deletion to fail
  });
});
```
