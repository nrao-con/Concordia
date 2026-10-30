import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getGuestCartItems, clearGuestCart } from "@/hooks/useGuestCart";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function useGuestCartSync() {
  const {
    isAuthenticated,
    isAdmin,
    user,
    hasSelectedPatient,
    patientAuthReady,
  } = useAuth();
  const isPatientAuth =
    patientAuthReady && isAuthenticated && !isAdmin && (!!user || hasSelectedPatient);
  const prevPatientRef = useRef(isPatientAuth);
  const { toast } = useToast();

  useEffect(() => {
    const wasGuest = !prevPatientRef.current;
    const isNowPatient = isPatientAuth;
    prevPatientRef.current = isPatientAuth;

    if (wasGuest && isNowPatient) {
      const guestItems = getGuestCartItems();
      if (guestItems.length === 0) return;

      (async () => {
        const failedItems: typeof guestItems = [];
        for (const item of guestItems) {
          try {
            await apiRequest("POST", "/api/cart", {
              productId: item.productId,
              quantity: item.quantity,
            });
          } catch {
            failedItems.push(item);
          }
        }

        if (failedItems.length === 0) {
          clearGuestCart();
          toast({
            title: "Cart synced",
            description: `${guestItems.length} item(s) from your guest cart have been added to your account.`,
          });
        } else {
          localStorage.setItem("concordia_guest_cart", JSON.stringify(failedItems));
          toast({
            title: "Some cart items couldn't be transferred",
            description: `${failedItems.length} item(s) could not be synced to your account cart. They may be out of stock.`,
            variant: "destructive",
          });
        }
        queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      })();
    }
  }, [isPatientAuth, toast]);
}
