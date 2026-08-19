import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { doc, onSnapshot, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const BOOTSTRAP_ADMIN_EMAILS = [
  'cam01back@gmail.com',
  'juanpcolinagonzalez@gmail.com',
  'kiosco.origenes@gmail.com'
];

export interface AdminRole {
  role: 'super' | 'admin';
  email: string;
  addedBy: string;
  addedAt: string;
}

export interface UseAdminResult {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  adminLoading: boolean;
}

export function useAdmin(currentUser: User | null | undefined): UseAdminResult {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [adminLoading, setAdminLoading] = useState<boolean>(true);

  useEffect(() => {
    if (currentUser === undefined) { return; }
    if (!currentUser) {
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setAdminLoading(false);
      return;
    }

    setAdminLoading(true);

    const checkPromotion = async () => {
      const email = (currentUser.email || '').toLowerCase();
      if (!email) return;
      try {
        const inviteRef = doc(db, 'admin_invites', email);
        const inviteSnap = await getDoc(inviteRef);
        if (inviteSnap.exists()) {
          const inviteData = inviteSnap.data();
          const targetRole = inviteData?.role || 'admin';
          const addedBy = inviteData?.addedBy || 'system';
          const addedAt = inviteData?.addedAt || new Date().toISOString();

          // Create admin record
          const adminRef = doc(db, 'admins', currentUser.uid);
          await setDoc(adminRef, {
            role: targetRole,
            email: currentUser.email,
            addedBy: addedBy,
            addedAt: addedAt
          });

          // Delete consumed invite
          await deleteDoc(inviteRef);
          console.log(`User ${email} promoted to admin/super role.`);
        }
      } catch (err) {
        console.warn("Error running promotion flow in hook:", err);
      }
    };

    checkPromotion();

    const docRef = doc(db, 'admins', currentUser.uid);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      const isBootstrapped = currentUser.emailVerified && BOOTSTRAP_ADMIN_EMAILS.includes(currentUser.email || '');
      
      if (docSnap.exists()) {
        const data = docSnap.data() as AdminRole;
        const hasAdminRole = data.role === 'admin' || data.role === 'super';
        const hasSuperRole = data.role === 'super';
        
        setIsAdmin(hasAdminRole || isBootstrapped);
        setIsSuperAdmin(hasSuperRole || isBootstrapped);
      } else {
        setIsAdmin(isBootstrapped);
        setIsSuperAdmin(isBootstrapped);
      }
      setAdminLoading(false);
    }, (error) => {
      console.warn("Error checking admin status:", error);
      // Fallback to bootstrap emails on error if necessary, to avoid lockout
      const isBootstrapped = currentUser.emailVerified && BOOTSTRAP_ADMIN_EMAILS.includes(currentUser.email || '');
      setIsAdmin(isBootstrapped);
      setIsSuperAdmin(isBootstrapped);
      setAdminLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  return { isAdmin, isSuperAdmin, adminLoading };
}
