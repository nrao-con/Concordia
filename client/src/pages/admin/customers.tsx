import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { User, Prescription, OrderWithItems, PatientDocument, AttendantAuditLog } from "@shared/schema";
import { AdminLayout } from "@/components/admin-layout";
import { formatPhoneNumber } from "@/lib/input-helpers";
import { AddressFields, EMPTY_ADDRESS, parseAddressString, toAddressString } from "@/components/address-fields";
import type { AddressValue } from "@/components/address-fields";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Search, Users, Award, Mail, Calendar, Eye, Pill, ShoppingCart, User as UserIcon, Phone, MapPin, AlertCircle, DollarSign, Save, X, FileText, CreditCard, IdCard, File, ExternalLink, Trash2, ZoomIn, HeartHandshake, Clock, Activity } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function AdminCustomers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [editData, setEditData] = useState<Partial<User>>({});
  const [editAddressParts, setEditAddressParts] = useState<AddressValue>(EMPTY_ADDRESS);
  const { toast } = useToast();

  const { data: users = [], isLoading, error: usersError } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: userSources = {}, error: userSourcesError } = useQuery<Record<string, string[]>>({
    queryKey: ["/api/admin/users/sources"],
  });

  // Fetch prescriptions and orders for selected user (scoped, HIPAA-compliant endpoints)
  const { 
    data: userPrescriptions = [], 
    isLoading: prescriptionsLoading,
    error: prescriptionsError 
  } = useQuery<Prescription[]>({
    queryKey: ["/api/admin/users", selectedUser?.id, "prescriptions"],
    queryFn: async () => {
      if (!selectedUser) return [];
      const response = await apiRequest("GET", `/api/admin/users/${selectedUser.id}/prescriptions`);
      return response.json();
    },
    enabled: !!selectedUser,
  });

  const { 
    data: userOrders = [],
    isLoading: ordersLoading,
    error: ordersError
  } = useQuery<OrderWithItems[]>({
    queryKey: ["/api/admin/users", selectedUser?.id, "orders"],
    queryFn: async () => {
      if (!selectedUser) return [];
      const response = await apiRequest("GET", `/api/admin/users/${selectedUser.id}/orders`);
      return response.json();
    },
    enabled: !!selectedUser,
  });

  // Fetch patient documents for selected user
  const { 
    data: userDocuments = [],
    isLoading: documentsLoading,
    error: documentsError
  } = useQuery<PatientDocument[]>({
    queryKey: ["/api/admin/users", selectedUser?.id, "documents"],
    queryFn: async () => {
      if (!selectedUser) return [];
      const response = await apiRequest("GET", `/api/admin/users/${selectedUser.id}/documents`);
      return response.json();
    },
    enabled: !!selectedUser,
  });

  // Fetch caregiver/home attendant for selected user
  interface AttendantData {
    hasAttendant: boolean;
    attendant?: {
      id: number;
      firstName: string;
      lastName: string;
      phoneNumber: string;
      email: string | null;
      agencyName: string | null;
    };
    relationship?: {
      relationshipType: string;
      linkedAt: string;
    };
  }

  const { 
    data: userAttendant,
    isLoading: attendantLoading,
    error: attendantError
  } = useQuery<AttendantData>({
    queryKey: ["/api/admin/users", selectedUser?.id, "attendant"],
    queryFn: async () => {
      if (!selectedUser) return { hasAttendant: false };
      const response = await apiRequest("GET", `/api/admin/users/${selectedUser.id}/attendant`);
      return response.json();
    },
    enabled: !!selectedUser,
  });

  // Fetch OTC loyalty card for selected user
  interface OtcCardData {
    id: number;
    userId: string;
    cardNumber: string;
    cardholderName: string;
    barcodeData: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }

  const { 
    data: userOtcCard,
    isLoading: otcCardLoading,
    error: otcCardError
  } = useQuery<OtcCardData | null>({
    queryKey: ["/api/admin/users", selectedUser?.id, "otc-card"],
    queryFn: async () => {
      if (!selectedUser) return null;
      const response = await apiRequest("GET", `/api/admin/users/${selectedUser.id}/otc-card`);
      return response.json();
    },
    enabled: !!selectedUser,
  });

  const { 
    data: caregiverActivityLogs = [],
    isLoading: activityLogsLoading,
    error: activityLogsError
  } = useQuery<AttendantAuditLog[]>({
    queryKey: ["/api/admin/attendant-audit-logs", selectedUser?.id],
    queryFn: async () => {
      if (!selectedUser) return [];
      const response = await apiRequest("GET", `/api/admin/attendant-audit-logs?patientId=${selectedUser.id}&limit=20`);
      return response.json();
    },
    enabled: !!selectedUser && !!userAttendant?.hasAttendant,
  });

  const formatActivityAction = (log: AttendantAuditLog): string => {
    const action = log.action || "";
    const resourceType = log.resourceType || "";
    const details = log.details as Record<string, any> | null;

    const actionLabels: Record<string, string> = {
      refill_request: "Requested a refill",
      order_placed: "Placed an order",
      profile_viewed: "Viewed patient profile",
      prescription_viewed: "Viewed prescriptions",
      medication_list_viewed: "Viewed medication list",
      order_viewed: "Viewed order history",
      login: "Logged in as caregiver",
      logout: "Logged out",
      dose_logged: "Logged a dose",
      appointment_scheduled: "Scheduled an appointment",
      document_uploaded: "Uploaded a document",
      message_sent: "Sent a message",
    };

    let description = actionLabels[action] || action.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

    if (resourceType && !actionLabels[action]) {
      description += ` (${resourceType.replace(/_/g, " ")})`;
    }

    if (details?.medicationName) {
      description += ` for ${details.medicationName}`;
    }
    if (details?.orderNumber) {
      description += ` #${details.orderNumber}`;
    }

    return description;
  };

  const getRelationshipLabel = (type: string) => {
    const labels: Record<string, string> = {
      home_health_aide: "Home Health Aide",
      family_caregiver: "Family Caregiver",
      nursing_assistant: "Nursing Assistant",
      social_worker: "Social Worker",
      power_of_attorney: "Power of Attorney",
      other: "Other",
    };
    return labels[type] || type;
  };

  const getDocumentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      drivers_license: "Driver's License",
      state_id: "State ID",
      insurance_card: "Insurance Card (Front)",
      insurance_card_back: "Insurance Card (Back)",
      miscellaneous: "Other Document",
    };
    return labels[type] || type;
  };

  const getDocumentIcon = (type: string) => {
    switch (type) {
      case "drivers_license":
      case "state_id":
        return <IdCard className="h-4 w-4" />;
      case "insurance_card":
      case "insurance_card_back":
        return <CreditCard className="h-4 w-4" />;
      default:
        return <File className="h-4 w-4" />;
    }
  };

  // State for image preview
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Delete customer profile mutation for admin
  const deleteCustomerMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("DELETE", `/api/admin/users/${userId}`);
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Customer deleted",
        description: "The customer profile has been removed successfully.",
      });
      setDeleteConfirmOpen(false);
      setProfileDialogOpen(false);
      setSelectedUser(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete customer",
        variant: "destructive",
      });
    },
  });

  // Delete document mutation for admin
  const deleteDocumentMutation = useMutation({
    mutationFn: async ({ userId, documentId }: { userId: string; documentId: number }) => {
      const response = await apiRequest("DELETE", `/api/admin/users/${userId}/documents/${documentId}`);
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Document deleted",
        description: "The document has been removed successfully.",
      });
      if (selectedUser) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/users", selectedUser.id, "documents"] });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete document",
        variant: "destructive",
      });
    },
  });

  const totalSpend = userOrders.reduce((sum, order) => sum + parseFloat(order.total), 0);
  const avgOrderValue = userOrders.length > 0 ? totalSpend / userOrders.length : 0;

  // Extract unique doctors from prescriptions
  const doctors = Array.from(new Set(userPrescriptions.map(p => p.prescribedBy).filter(Boolean)));

  const filteredUsers = users.filter((user) => {
    const search = searchTerm.toLowerCase();
    return (
      user.email?.toLowerCase().includes(search) ||
      user.firstName?.toLowerCase().includes(search) ||
      user.lastName?.toLowerCase().includes(search) ||
      user.referralCode?.toLowerCase().includes(search) ||
      user.phoneNumber?.toLowerCase().includes(search)
    );
  });

  // Create a lookup map for referrer names
  const userLookup = users.reduce((acc, u) => {
    acc[u.id] = u;
    return acc;
  }, {} as Record<string, User>);

  const getReferrerName = (referredByUserId: string | null | undefined): string => {
    if (!referredByUserId) return "-";
    const referrer = userLookup[referredByUserId];
    return referrer ? `${referrer.firstName || ""} ${referrer.lastName || ""}`.trim() || referrer.email || "Unknown" : "Unknown";
  };

  const totalLoyaltyPoints = users.reduce((sum, user) => sum + (user.loyaltyPoints || 0), 0);
  const activeCustomers = users.filter((u) => u.role === "patient").length;

  // Mutation for updating customer
  const updateCustomerMutation = useMutation({
    mutationFn: async (updates: Partial<User>) => {
      if (!selectedUser?.id) throw new Error("No user selected");
      const response = await apiRequest("PATCH", `/api/admin/users/${selectedUser.id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Customer updated",
        description: "Customer information has been saved successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setProfileDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update customer",
        variant: "destructive",
      });
    },
  });

  const handleOpenProfile = (user: User) => {
    setSelectedUser(user);
    const parsedAddress = parseAddressString(user.address || "");
    setEditAddressParts(parsedAddress);
    setEditData({
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      email: user.email || "",
      phoneNumber: user.phoneNumber || "",
      address: user.address || "",
      allergies: user.allergies || "",
      medicalConditions: user.medicalConditions || "",
      insuranceProvider: user.insuranceProvider || "",
      insurancePolicyNumber: user.insurancePolicyNumber || "",
      insuranceGroupNumber: user.insuranceGroupNumber || "",
      adminNotes: user.adminNotes || "",
    });
    setProfileDialogOpen(true);
  };

  const handleSave = () => {
    updateCustomerMutation.mutate(editData);
  };

  const handleCancel = () => {
    setProfileDialogOpen(false);
    setEditData({});
  };

  return (
    <AdminLayout backTo="/admin">
      <div className="container mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <h1 className="mb-2 font-heading text-2xl md:text-3xl font-bold">Customer Management</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            View and manage all registered customers
          </p>
        </div>

        {/* Stats */}
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-customers">
                {isLoading ? "..." : users.length}
              </div>
              <p className="text-xs text-muted-foreground">
                {activeCustomers} active patients
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Loyalty Points</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-loyalty">
                {isLoading ? "..." : totalLoyaltyPoints.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                Across all customers
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg. Loyalty Points</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-avg-loyalty">
                {isLoading ? "..." : users.length > 0 ? Math.round(totalLoyaltyPoints / users.length) : 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Per customer
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filter */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Customer Directory</CardTitle>
            <CardDescription>Search and view customer information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, phone, or referral code..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search-customers"
              />
            </div>

            {usersError && (
              <div className="mb-4 p-4 bg-destructive/10 text-destructive rounded-md" role="alert">
                <p className="text-sm font-medium">Error loading customers</p>
                <p className="text-xs mt-1">{(usersError as Error).message}</p>
              </div>
            )}
            {userSourcesError && (
              <div className="mb-4 p-4 bg-destructive/10 text-destructive rounded-md" role="alert">
                <p className="text-sm font-medium">Error loading customer sources</p>
                <p className="text-xs mt-1">{(userSourcesError as Error).message}</p>
              </div>
            )}
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="overflow-x-auto hidden md:block">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Sources</TableHead>
                          <TableHead>Referral Code</TableHead>
                          <TableHead>Referred By</TableHead>
                          <TableHead>Points</TableHead>
                          <TableHead>Joined</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground">
                              No customers found
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredUsers.map((user) => (
                            <TableRow key={user.id} data-testid={`customer-row-${user.id}`}>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  {user.profileImageUrl ? (
                                    <img
                                      src={user.profileImageUrl}
                                      alt={user.firstName || "User"}
                                      className="h-8 w-8 rounded-full"
                                    />
                                  ) : (
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                      {user.firstName?.[0] || user.email?.[0]?.toUpperCase() || "?"}
                                    </div>
                                  )}
                                  <div>
                                    <p className="font-medium">
                                      {user.firstName} {user.lastName}
                                    </p>
                                    <p className="text-xs font-mono font-semibold text-primary" data-testid={`text-patient-id-${user.id}`}>{(user as any).concordiaId || `P-${user.id.slice(0, 8).toUpperCase()}`}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Mail className="h-4 w-4 text-muted-foreground" />
                                  <span className="truncate max-w-[180px]">{user.email || "-"}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                {userSources[user.id]?.length ? (
                                  <div className="flex flex-wrap gap-1" data-testid={`sources-${user.id}`}>
                                    {userSources[user.id].map((src) => (
                                      <Badge key={src} variant="secondary" className="text-xs">
                                        {src}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-xs">Not available</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {user.referralCode ? (
                                  <Badge variant="outline" className="font-mono text-xs">
                                    {user.referralCode}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {user.referredByUserId ? (
                                  <div className="flex items-center gap-2">
                                    <Users className="h-4 w-4 text-green-600" />
                                    <span className="text-sm">{getReferrerName(user.referredByUserId)}</span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Award className="h-4 w-4 text-amber-600" />
                                  <span className="font-semibold">{user.loyaltyPoints || 0}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Calendar className="h-4 w-4" />
                                  {new Date(user.createdAt).toLocaleDateString()}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleOpenProfile(user)}
                                  data-testid={`button-view-profile-${user.id}`}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  View/Edit Profile
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Mobile Card View */}
                <div className="space-y-3 md:hidden">
                  {filteredUsers.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      No customers found
                    </div>
                  ) : (
                    filteredUsers.map((user) => (
                      <Card key={user.id} className="p-4" data-testid={`customer-card-${user.id}`}>
                        <div className="flex items-center gap-3 mb-3">
                          {user.profileImageUrl ? (
                            <img
                              src={user.profileImageUrl}
                              alt={user.firstName || "User"}
                              className="h-10 w-10 rounded-full"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                              {user.firstName?.[0] || user.email?.[0]?.toUpperCase() || "?"}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {user.firstName} {user.lastName}
                            </p>
                            <p className="text-xs font-mono font-semibold text-primary" data-testid={`text-patient-id-mobile-${user.id}`}>{(user as any).concordiaId || `P-${user.id.slice(0, 8).toUpperCase()}`}</p>
                          </div>
                        </div>
                        <div className="space-y-1 mb-3">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            <span className="truncate">{user.email || "-"}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            <span>{user.phoneNumber || "-"}</span>
                          </div>
                          {userSources[user.id]?.length ? (
                            <div className="flex flex-wrap gap-1 pt-1" data-testid={`sources-mobile-${user.id}`}>
                              {userSources[user.id].map((src) => (
                                <Badge key={src} variant="secondary" className="text-xs">
                                  {src}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => handleOpenProfile(user)}
                          data-testid={`button-view-profile-mobile-${user.id}`}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </Button>
                      </Card>
                    ))
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Customer Profile Modal */}
        <Dialog open={profileDialogOpen} onOpenChange={handleCancel}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <UserIcon className="h-6 w-6" />
                Edit Customer Profile
              </DialogTitle>
              <DialogDescription>
                Update information for {selectedUser?.firstName} {selectedUser?.lastName}
              </DialogDescription>
            </DialogHeader>

            {selectedUser && (
              <div className="space-y-6 mt-4">
                {/* Quick Summary Banner */}
                <div className="rounded-lg bg-muted/50 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <UserIcon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{selectedUser.firstName} {selectedUser.lastName}</h3>
                      <p className="text-sm text-muted-foreground">Member since {new Date(selectedUser.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:gap-3">
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Award className="h-3 w-3" />
                      {selectedUser.loyaltyPoints || 0} pts
                    </Badge>
                    <Badge variant="outline" className="flex items-center gap-1">
                      <ShoppingCart className="h-3 w-3" />
                      {userOrders.length} orders
                    </Badge>
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Pill className="h-3 w-3" />
                      {userPrescriptions.length} Rx
                    </Badge>
                    {userAttendant?.hasAttendant && (
                      <Badge className="flex items-center gap-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        <HeartHandshake className="h-3 w-3" />
                        Caregiver
                      </Badge>
                    )}
                  </div>
                </div>
                
                {/* Basic Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Basic Information</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        value={editData.firstName || ""}
                        onChange={(e) => setEditData({ ...editData, firstName: e.target.value })}
                        data-testid="input-first-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        value={editData.lastName || ""}
                        onChange={(e) => setEditData({ ...editData, lastName: e.target.value })}
                        data-testid="input-last-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={editData.email || ""}
                        onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                        data-testid="input-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phoneNumber">Phone Number</Label>
                      <Input
                        id="phoneNumber"
                        value={editData.phoneNumber || ""}
                        onChange={(e) => setEditData({ ...editData, phoneNumber: formatPhoneNumber(e.target.value) })}
                        placeholder="10-digit phone number"
                        maxLength={10}
                        inputMode="numeric"
                        data-testid="input-phone"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <h4 className="text-sm font-medium">Address</h4>
                      <AddressFields
                        value={editAddressParts}
                        onChange={(parts, assembled) => {
                          setEditAddressParts(parts);
                          setEditData((prev) => ({ ...prev, address: assembled }));
                        }}
                        idPrefix="cust-addr"
                      />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Loyalty Points</p>
                      <p className="font-medium flex items-center gap-2">
                        <Award className="h-4 w-4 text-amber-600" />
                        {selectedUser.loyaltyPoints || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Member Since</p>
                      <p className="font-medium">{new Date(selectedUser.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Referral Code</p>
                      <p className="font-medium font-mono" data-testid="text-referral-code">
                        {selectedUser.referralCode || "Not generated"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Referred By</p>
                      <p className="font-medium" data-testid="text-referred-by">
                        {selectedUser.referredByUserId 
                          ? users.find(u => u.id === selectedUser.referredByUserId)?.firstName || selectedUser.referredByUserId
                          : "No referrer"
                        }
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Insurance & Medical Info */}
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Insurance Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="insuranceProvider">Provider</Label>
                        <Input
                          id="insuranceProvider"
                          value={editData.insuranceProvider || ""}
                          onChange={(e) => setEditData({ ...editData, insuranceProvider: e.target.value })}
                          placeholder="Insurance provider name"
                          data-testid="input-insurance-provider"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="insurancePolicyNumber">Policy Number</Label>
                        <Input
                          id="insurancePolicyNumber"
                          value={editData.insurancePolicyNumber || ""}
                          onChange={(e) => setEditData({ ...editData, insurancePolicyNumber: e.target.value })}
                          placeholder="Policy number"
                          data-testid="input-policy-number"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="insuranceGroupNumber">Group Number</Label>
                        <Input
                          id="insuranceGroupNumber"
                          value={editData.insuranceGroupNumber || ""}
                          onChange={(e) => setEditData({ ...editData, insuranceGroupNumber: e.target.value })}
                          placeholder="Group number"
                          data-testid="input-group-number"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <AlertCircle className="h-5 w-5" />
                        Medical Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="allergies">Allergies</Label>
                        <Textarea
                          id="allergies"
                          value={editData.allergies || ""}
                          onChange={(e) => setEditData({ ...editData, allergies: e.target.value })}
                          placeholder="List any allergies"
                          rows={3}
                          data-testid="input-allergies"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="medicalConditions">Medical Conditions</Label>
                        <Textarea
                          id="medicalConditions"
                          value={editData.medicalConditions || ""}
                          onChange={(e) => setEditData({ ...editData, medicalConditions: e.target.value })}
                          placeholder="List any medical conditions"
                          rows={3}
                          data-testid="input-medical-conditions"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Home Attendant / Caregiver Section */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <HeartHandshake className="h-5 w-5" />
                      Home Attendant / Caregiver
                    </CardTitle>
                    <CardDescription>Contact information for the patient's authorized caregiver</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {attendantLoading ? (
                      <Skeleton className="h-20" />
                    ) : attendantError ? (
                      <div className="p-4 bg-destructive/10 text-destructive rounded-md" role="alert">
                        <p className="text-sm font-medium">Error loading caregiver</p>
                        <p className="text-xs mt-1">{(attendantError as Error).message}</p>
                      </div>
                    ) : userAttendant?.hasAttendant ? (
                      <div className="flex items-start gap-4 p-3 rounded-lg border bg-muted/30" data-testid="caregiver-info-card">
                        <div className="rounded-full bg-primary/10 p-3">
                          <UserIcon className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1 space-y-2">
                          <div>
                            <h4 className="font-medium" data-testid="text-caregiver-name">
                              {userAttendant.attendant?.firstName} {userAttendant.attendant?.lastName}
                            </h4>
                            <Badge variant="secondary" className="mt-1" data-testid="badge-caregiver-relationship">
                              {getRelationshipLabel(userAttendant.relationship?.relationshipType || "other")}
                            </Badge>
                          </div>
                          <div className="grid gap-2 text-sm">
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4 text-muted-foreground" />
                              <a 
                                href={`tel:${userAttendant.attendant?.phoneNumber}`}
                                className="text-primary hover:underline"
                                data-testid="link-caregiver-phone"
                              >
                                {userAttendant.attendant?.phoneNumber}
                              </a>
                            </div>
                            {userAttendant.attendant?.email && (
                              <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                <a 
                                  href={`mailto:${userAttendant.attendant.email}`}
                                  className="text-primary hover:underline"
                                  data-testid="link-caregiver-email"
                                >
                                  {userAttendant.attendant.email}
                                </a>
                              </div>
                            )}
                            {userAttendant.attendant?.agencyName && (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <span>Agency:</span>
                                <span>{userAttendant.attendant.agencyName}</span>
                              </div>
                            )}
                            {userAttendant.relationship?.linkedAt && (
                              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                                <Calendar className="h-3 w-3" />
                                <span>Linked {new Date(userAttendant.relationship.linkedAt).toLocaleDateString()}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground" data-testid="text-no-caregiver">
                        <HeartHandshake className="h-10 w-10 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No caregiver on file for this patient</p>
                      </div>
                    )}

                    {userAttendant?.hasAttendant && (
                      <>
                        <Separator className="my-4" />
                        <div data-testid="caregiver-activity-feed">
                          <h4 className="font-medium text-sm flex items-center gap-2 mb-3">
                            <Activity className="h-4 w-4 text-muted-foreground" />
                            Recent Caregiver Activity
                          </h4>
                          {activityLogsLoading ? (
                            <div className="space-y-2">
                              <Skeleton className="h-10 w-full" />
                              <Skeleton className="h-10 w-full" />
                              <Skeleton className="h-10 w-full" />
                            </div>
                          ) : activityLogsError ? (
                            <div className="p-4 bg-destructive/10 text-destructive rounded-md" role="alert">
                              <p className="text-sm font-medium">Error loading caregiver activity</p>
                              <p className="text-xs mt-1">{(activityLogsError as Error).message}</p>
                            </div>
                          ) : caregiverActivityLogs.length === 0 ? (
                            <div className="text-center py-4 text-muted-foreground" data-testid="text-no-caregiver-activity">
                              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">No recent caregiver activity</p>
                            </div>
                          ) : (
                            <ScrollArea className="max-h-64">
                              <div className="space-y-1">
                                {caregiverActivityLogs.map((log, index) => (
                                  <div
                                    key={log.id}
                                    className="flex items-start gap-3 p-2 rounded-md"
                                    data-testid={`activity-item-${log.id}`}
                                  >
                                    <div className="mt-1 flex-shrink-0">
                                      <div className="h-2 w-2 rounded-full bg-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm" data-testid={`activity-description-${log.id}`}>
                                        {formatActivityAction(log)}
                                      </p>
                                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5" data-testid={`activity-timestamp-${log.id}`}>
                                        <Clock className="h-3 w-3" />
                                        {new Date(log.createdAt).toLocaleString()}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* OTC Loyalty Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      OTC Loyalty Card
                    </CardTitle>
                    <CardDescription>Customer's in-store loyalty card for OTC purchases</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {otcCardLoading ? (
                      <Skeleton className="h-20" />
                    ) : otcCardError ? (
                      <div className="p-4 bg-destructive/10 text-destructive rounded-md" role="alert">
                        <p className="text-sm font-medium">Error loading OTC card</p>
                        <p className="text-xs mt-1">{(otcCardError as Error).message}</p>
                      </div>
                    ) : userOtcCard ? (
                      <div className="rounded-lg border p-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" data-testid="otc-card-info">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-2">
                            <div>
                              <p className="text-xs text-muted-foreground">Cardholder Name</p>
                              <p className="font-semibold" data-testid="text-otc-cardholder">{userOtcCard.cardholderName}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Card Number</p>
                              <p className="font-mono text-sm tracking-wider" data-testid="text-otc-card-number">{userOtcCard.cardNumber}</p>
                            </div>
                            <div className="flex items-center gap-3 pt-1">
                              <Badge variant={userOtcCard.isActive ? "default" : "secondary"} data-testid="badge-otc-card-status">
                                {userOtcCard.isActive ? "Active" : "Inactive"}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                Added {new Date(userOtcCard.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          {userOtcCard.barcodeData && (
                            <div className="flex flex-col items-center">
                              <p className="text-xs text-muted-foreground mb-1">Barcode</p>
                              <div className="bg-white p-2 rounded">
                                <img 
                                  src={userOtcCard.barcodeData} 
                                  alt="Card barcode" 
                                  className="h-12 w-auto"
                                  data-testid="img-otc-barcode"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground" data-testid="text-no-otc-card">
                        <CreditCard className="h-10 w-10 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No OTC loyalty card on file</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Admin Notes */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Admin Notes
                    </CardTitle>
                    <CardDescription>Internal notes about this customer (not visible to patient)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      id="adminNotes"
                      value={editData.adminNotes || ""}
                      onChange={(e) => setEditData({ ...editData, adminNotes: e.target.value })}
                      placeholder="Add notes about this customer (e.g., special instructions, delivery preferences, communication notes)"
                      rows={4}
                      data-testid="input-admin-notes"
                    />
                  </CardContent>
                </Card>

                {/* Prescriptions */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Pill className="h-5 w-5" />
                      Prescriptions ({userPrescriptions.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {prescriptionsLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                      </div>
                    ) : prescriptionsError ? (
                      <div className="p-4 bg-destructive/10 text-destructive rounded-md">
                        <p className="text-sm font-medium">Error loading prescriptions</p>
                        <p className="text-xs mt-1">{(prescriptionsError as Error).message}</p>
                      </div>
                    ) : userPrescriptions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No prescriptions on record</p>
                    ) : (
                      <div className="space-y-2">
                        {userPrescriptions.slice(0, 5).map((rx) => (
                          <div key={rx.id} className="flex items-center justify-between p-2 rounded-md hover-elevate border">
                            <div>
                              <p className="font-medium">{rx.medicationName}</p>
                              <p className="text-sm text-muted-foreground">Prescribed by {rx.prescribedBy}</p>
                            </div>
                            <Badge variant={rx.status === "active" ? "default" : "secondary"}>
                              {rx.status}
                            </Badge>
                          </div>
                        ))}
                        {userPrescriptions.length > 5 && (
                          <p className="text-sm text-muted-foreground text-center pt-2">
                            +{userPrescriptions.length - 5} more prescriptions
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Doctors */}
                {doctors.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Associated Doctors</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {doctors.map((doctor, idx) => (
                          <Badge key={idx} variant="outline">
                            {doctor}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Order History & Spend */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                      <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{userOrders.length}</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Spend</CardTitle>
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">${totalSpend.toFixed(2)}</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Avg. Order Value</CardTitle>
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">${avgOrderValue.toFixed(2)}</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Recent Orders */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Recent Orders</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {ordersLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                      </div>
                    ) : ordersError ? (
                      <div className="p-4 bg-destructive/10 text-destructive rounded-md">
                        <p className="text-sm font-medium">Error loading orders</p>
                        <p className="text-xs mt-1">{(ordersError as Error).message}</p>
                      </div>
                    ) : userOrders.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No orders on record</p>
                    ) : (
                      <div className="space-y-2">
                        {userOrders.slice(0, 5).map((order) => (
                          <div key={order.id} className="flex items-center justify-between p-2 rounded-md hover-elevate border">
                            <div>
                              <p className="font-medium">Order #{order.orderNumber}</p>
                              <p className="text-sm text-muted-foreground">
                                {new Date(order.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">${order.total}</p>
                              <Badge variant={order.status === "completed" ? "default" : "secondary"}>
                                {order.status}
                              </Badge>
                            </div>
                          </div>
                        ))}
                        {userOrders.length > 5 && (
                          <p className="text-sm text-muted-foreground text-center pt-2">
                            +{userOrders.length - 5} more orders
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Patient Documents */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Patient Documents ({userDocuments.length})
                    </CardTitle>
                    <CardDescription>
                      View uploaded identification and insurance documents
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {documentsLoading ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                      </div>
                    ) : documentsError ? (
                      <div className="p-4 bg-destructive/10 text-destructive rounded-md">
                        <p className="text-sm font-medium">Error loading documents</p>
                        <p className="text-xs mt-1">{(documentsError as Error).message}</p>
                      </div>
                    ) : userDocuments.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-6 text-center">
                        <File className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          No documents uploaded by this patient
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {userDocuments.map((doc) => (
                          <div
                            key={doc.id}
                            className="flex items-center gap-3 rounded-lg border p-3"
                            data-testid={`admin-document-${doc.id}`}
                          >
                            <div 
                              className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => !doc.fileUrl.toLowerCase().endsWith('.pdf') && setPreviewImage({ 
                                url: doc.fileUrl, 
                                title: getDocumentTypeLabel(doc.documentType) 
                              })}
                            >
                              {doc.fileUrl.toLowerCase().endsWith('.pdf') ? (
                                <FileText className="h-8 w-8 text-muted-foreground" />
                              ) : (
                                <img
                                  src={doc.fileUrl}
                                  alt={doc.documentType}
                                  className="h-16 w-16 object-cover"
                                />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {getDocumentIcon(doc.documentType)}
                                <span className="text-sm font-medium truncate">
                                  {getDocumentTypeLabel(doc.documentType)}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                              </p>
                              <div className="flex items-center gap-1 mt-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => setPreviewImage({ 
                                    url: doc.fileUrl, 
                                    title: getDocumentTypeLabel(doc.documentType) 
                                  })}
                                  data-testid={`button-view-document-${doc.id}`}
                                >
                                  <ZoomIn className="h-3 w-3 mr-1" />
                                  View
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => {
                                    if (confirm("Are you sure you want to delete this document? This action cannot be undone.")) {
                                      deleteDocumentMutation.mutate({ 
                                        userId: selectedUser!.id, 
                                        documentId: doc.id 
                                      });
                                    }
                                  }}
                                  disabled={deleteDocumentMutation.isPending}
                                  data-testid={`button-delete-document-${doc.id}`}
                                >
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  Delete
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Image Preview Dialog */}
                {previewImage && (
                  <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
                      <DialogHeader>
                        <DialogTitle>{previewImage.title}</DialogTitle>
                        <DialogDescription>
                          Click outside or press escape to close
                        </DialogDescription>
                      </DialogHeader>
                      <div className="flex items-center justify-center p-4">
                        <img
                          src={previewImage.url}
                          alt={previewImage.title}
                          className="max-w-full max-h-[70vh] object-contain rounded-lg"
                        />
                      </div>
                      <div className="flex justify-end">
                        <a
                          href={previewImage.url}
                          download
                        >
                          <Button variant="outline" type="button">
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Download
                          </Button>
                        </a>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 pt-4 border-t">
                  <Button
                    variant="destructive"
                    onClick={() => setDeleteConfirmOpen(true)}
                    disabled={updateCustomerMutation.isPending || deleteCustomerMutation.isPending}
                    className="w-full sm:w-auto"
                    data-testid="button-delete-customer"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Customer
                  </Button>
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <Button
                      variant="outline"
                      onClick={handleCancel}
                      disabled={updateCustomerMutation.isPending}
                      className="w-full sm:w-auto"
                      data-testid="button-cancel"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={updateCustomerMutation.isPending}
                      className="w-full sm:w-auto"
                      data-testid="button-save"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {updateCustomerMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </div>

                {/* Delete Confirmation Dialog */}
                <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Customer Profile</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this customer profile? This will permanently remove:
                        <ul className="list-disc list-inside mt-2 space-y-1">
                          <li>All personal information</li>
                          <li>Uploaded documents</li>
                          <li>Cart items</li>
                          <li>Loyalty points and transactions</li>
                          <li>Notifications</li>
                        </ul>
                        <p className="mt-2 font-medium text-destructive">
                          This action cannot be undone.
                        </p>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={deleteCustomerMutation.isPending}>
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => selectedUser && deleteCustomerMutation.mutate(selectedUser.id)}
                        disabled={deleteCustomerMutation.isPending}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        data-testid="button-confirm-delete-customer"
                      >
                        {deleteCustomerMutation.isPending ? "Deleting..." : "Delete Customer"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
