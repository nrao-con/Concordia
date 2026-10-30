import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { useAdminWebSocket } from "@/hooks/useAdminWebSocket";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { 
  Search, 
  Gift, 
  Users, 
  TrendingUp, 
  Award, 
  Clock,
  Plus,
  Minus,
  ArrowLeftRight,
  Lock,
  Unlock,
  Eye,
  Settings,
  History,
  Coins,
  Target,
  Megaphone,
  Edit,
  Trash2,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { 
  User, 
  PointsWallet, 
  PointsLedgerEntry, 
  EarningRule, 
  Reward, 
  Campaign 
} from "@shared/schema";

interface WalletWithUser extends PointsWallet {
  user?: User;
}

interface PointsAnalytics {
  totalPointsIssued: number;
  totalPointsRedeemed: number;
  totalPointsExpired: number;
  activeWallets: number;
  topEarners: { userId: string; points: number }[];
}

function getApiErrorMessage(error: unknown) {
  if (!(error instanceof Error) || !error.message) return "The requested rewards update could not be completed.";
  const responseBody = error.message.match(/^\d+:\s*([\s\S]*)$/)?.[1];
  if (responseBody) {
    try {
      const parsed = JSON.parse(responseBody);
      if (typeof parsed.message === "string") return parsed.message;
    } catch {
      // Preserve non-JSON server responses below.
    }
  }
  return error.message;
}

export default function AdminRewards() {
  const [activeTab, setActiveTab] = useState("overview");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<"award" | "deduct" | "transfer" | "freeze" | "unfreeze">("award");
  const [actionPoints, setActionPoints] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [transferToUserId, setTransferToUserId] = useState("");
  const [editRuleDialogOpen, setEditRuleDialogOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<EarningRule | null>(null);
  const [editRewardDialogOpen, setEditRewardDialogOpen] = useState(false);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [newRewardDialogOpen, setNewRewardDialogOpen] = useState(false);
  const [newRuleDialogOpen, setNewRuleDialogOpen] = useState(false);
  const [confirmFreezeOpen, setConfirmFreezeOpen] = useState(false);
  const { toast } = useToast();
  
  // Subscribe to WebSocket for real-time updates
  useAdminWebSocket();

  // Fetch analytics - poll every 15 seconds for real-time updates
  const { data: analytics, isLoading: analyticsLoading, error: analyticsError } = useQuery<PointsAnalytics>({
    queryKey: ["/api/admin/points/analytics"],
    refetchInterval: 15000,
  });

  // Fetch all users with their wallets - poll every 15 seconds for real-time updates
  const { data: users = [], isLoading: usersLoading, error: usersError } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    refetchInterval: 15000,
  });

  // Fetch earning rules
  const { data: earningRules = [], isLoading: rulesLoading, error: rulesError } = useQuery<EarningRule[]>({
    queryKey: ["/api/admin/points/earning-rules"],
  });

  // Fetch rewards catalog
  const { data: rewards = [], isLoading: rewardsLoading, error: rewardsError } = useQuery<Reward[]>({
    queryKey: ["/api/admin/points/rewards"],
  });

  // Fetch campaigns
  const { data: campaigns = [], isLoading: campaignsLoading, error: campaignsError } = useQuery<Campaign[]>({
    queryKey: ["/api/admin/points/campaigns"],
  });

  // Fetch wallet for selected user - poll when dialog is open
  const { data: selectedWallet, isLoading: walletLoading, error: walletError } = useQuery<PointsWallet | null>({
    queryKey: ["/api/admin/points/wallet", selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return null;
      const response = await apiRequest("GET", `/api/admin/points/wallet/${selectedUserId}`);
      const data = await response.json();
      return data.wallet || null;
    },
    enabled: !!selectedUserId,
    refetchInterval: walletDialogOpen ? 5000 : false,
  });

  // Fetch ledger for selected user - poll when dialog is open
  const { data: selectedLedger = [], isLoading: ledgerLoading, error: ledgerError } = useQuery<PointsLedgerEntry[]>({
    queryKey: ["/api/admin/points/ledger", selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return [];
      const response = await apiRequest("GET", `/api/admin/points/wallet/${selectedUserId}/ledger`);
      return response.json();
    },
    enabled: !!selectedUserId && walletDialogOpen,
    refetchInterval: walletDialogOpen ? 5000 : false,
  });

  // Award points mutation
  const awardMutation = useMutation({
    mutationFn: async (data: { userId: string; points: number; reason: string }) => {
      return await apiRequest("POST", "/api/admin/points/award", data);
    },
    onSuccess: () => {
      toast({ title: "Points Awarded", description: "Points have been added successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/points"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setActionDialogOpen(false);
      resetActionForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  // Deduct points mutation
  const deductMutation = useMutation({
    mutationFn: async (data: { userId: string; points: number; reason: string }) => {
      return await apiRequest("POST", "/api/admin/points/deduct", data);
    },
    onSuccess: () => {
      toast({ title: "Points Deducted", description: "Points have been deducted successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/points"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setActionDialogOpen(false);
      resetActionForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  // Freeze wallet mutation
  const freezeMutation = useMutation({
    mutationFn: async (data: { userId: string; reason: string }) => {
      return await apiRequest("POST", `/api/admin/points/wallet/${data.userId}/freeze`, { reason: data.reason });
    },
    onSuccess: () => {
      toast({ title: "Wallet Frozen", description: "The wallet has been frozen." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/points"] });
      setConfirmFreezeOpen(false);
      setActionDialogOpen(false);
      resetActionForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  // Unfreeze wallet mutation
  const unfreezeMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest("POST", `/api/admin/points/wallet/${userId}/unfreeze`, {});
    },
    onSuccess: () => {
      toast({ title: "Wallet Unfrozen", description: "The wallet has been unfrozen." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/points"] });
      setActionDialogOpen(false);
      resetActionForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  // Update earning rule mutation
  const updateRuleMutation = useMutation({
    mutationFn: async (data: { id: number; updates: { basePoints?: number; isActive?: boolean; description?: string } }) => {
      return await apiRequest("PATCH", `/api/admin/points/earning-rules/${data.id}`, data.updates);
    },
    onSuccess: () => {
      toast({ title: "Rule Updated", description: "Earning rule has been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/points/earning-rules"] });
      setEditRuleDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  // Create earning rule mutation
  const createRuleMutation = useMutation({
    mutationFn: async (data: {
      ruleKey: string;
      actionType: string;
      name: string;
      description?: string;
      basePoints: number;
      pointsPerDollar?: string;
      isOneTime?: boolean;
      isActive?: boolean;
    }) => {
      return await apiRequest("POST", "/api/admin/points/earning-rules", data);
    },
    onSuccess: () => {
      toast({ title: "Rule Created", description: "Earning rule has been created." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/points/earning-rules"] });
      setNewRuleDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  // Delete earning rule mutation
  const deleteRuleMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/admin/points/earning-rules/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Rule Deleted", description: "Earning rule has been removed." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/points/earning-rules"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  // Create reward mutation
  const createRewardMutation = useMutation({
    mutationFn: async (data: Partial<Reward>) => {
      return await apiRequest("POST", "/api/admin/points/rewards", data);
    },
    onSuccess: () => {
      toast({ title: "Reward Created", description: "New reward has been added to the catalog." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/points/rewards"] });
      setNewRewardDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  // Update reward mutation
  const updateRewardMutation = useMutation({
    mutationFn: async (data: { id: number; updates: Partial<Reward> }) => {
      return await apiRequest("PATCH", `/api/admin/points/rewards/${data.id}`, data.updates);
    },
    onSuccess: () => {
      toast({ title: "Reward Updated", description: "Reward has been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/points/rewards"] });
      setEditRewardDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  // Delete reward mutation
  const deleteRewardMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/admin/points/rewards/${id}`, {});
    },
    onSuccess: () => {
      toast({ title: "Reward Deleted", description: "Reward has been removed from the catalog." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/points/rewards"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  const resetActionForm = () => {
    setActionPoints("");
    setActionReason("");
    setTransferToUserId("");
    setSelectedUserId(null);
  };

  const handleAction = () => {
    if (!selectedUserId) return;
    const points = parseInt(actionPoints);
    if (isNaN(points) || points <= 0) {
      toast({ title: "Invalid Points", description: "Please enter a valid number of points.", variant: "destructive" });
      return;
    }

    switch (actionType) {
      case "award":
        awardMutation.mutate({ userId: selectedUserId, points, reason: actionReason || "Admin adjustment" });
        break;
      case "deduct":
        deductMutation.mutate({ userId: selectedUserId, points, reason: actionReason || "Admin adjustment" });
        break;
      case "freeze":
        setConfirmFreezeOpen(true);
        break;
    }
  };

  const handleFreeze = () => {
    if (!selectedUserId) return;
    freezeMutation.mutate({ userId: selectedUserId, reason: actionReason || "Admin action" });
  };

  const handleUnfreeze = () => {
    if (!selectedUserId) return;
    unfreezeMutation.mutate(selectedUserId);
  };

  const filteredUsers = users.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    return (
      user.firstName?.toLowerCase().includes(searchLower) ||
      user.lastName?.toLowerCase().includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower) ||
      user.phoneNumber?.includes(searchTerm)
    );
  });

  const openWalletDialog = (userId: string) => {
    setSelectedUserId(userId);
    setWalletDialogOpen(true);
  };

  const openActionDialog = (userId: string, type: "award" | "deduct" | "freeze" | "unfreeze") => {
    setSelectedUserId(userId);
    setActionType(type);
    setActionDialogOpen(true);
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <AdminLayout title="Rewards Program Management" backTo="/admin">
      <div className="p-4 md:p-6 space-y-6">
        {[analyticsError, usersError, rulesError, rewardsError, campaignsError].filter(Boolean).map((error, index) => (
          <div key={index} className="p-4 bg-destructive/10 text-destructive rounded-md" role="alert">
            <p className="text-sm font-medium">Failed to load rewards data</p>
            <p className="text-xs mt-1">{(error as Error).message}</p>
          </div>
        ))}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full mb-6 overflow-x-auto flex-nowrap flex justify-start md:grid md:grid-cols-5">
            <TabsTrigger value="overview" className="flex items-center gap-2 flex-shrink-0" data-testid="tab-overview">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="wallets" className="flex items-center gap-2 flex-shrink-0" data-testid="tab-wallets">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Wallets</span>
            </TabsTrigger>
            <TabsTrigger value="rules" className="flex items-center gap-2 flex-shrink-0" data-testid="tab-rules">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Earning Rules</span>
            </TabsTrigger>
            <TabsTrigger value="rewards" className="flex items-center gap-2 flex-shrink-0" data-testid="tab-rewards">
              <Gift className="h-4 w-4" />
              <span className="hidden sm:inline">Rewards</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2 flex-shrink-0" data-testid="tab-analytics">
              <Target className="h-4 w-4" />
              <span className="hidden sm:inline">Analytics</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Points Issued</CardTitle>
                  <Coins className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {analyticsLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <div className="text-2xl font-bold" data-testid="text-total-issued">
                      {analytics?.totalPointsIssued?.toLocaleString() || 0}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Points Redeemed</CardTitle>
                  <Gift className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {analyticsLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <div className="text-2xl font-bold" data-testid="text-total-redeemed">
                      {analytics?.totalPointsRedeemed?.toLocaleString() || 0}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Points Expired</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {analyticsLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <div className="text-2xl font-bold" data-testid="text-total-expired">
                      {analytics?.totalPointsExpired?.toLocaleString() || 0}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Wallets</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {analyticsLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <div className="text-2xl font-bold" data-testid="text-active-wallets">
                      {analytics?.activeWallets || 0}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Top Earners</CardTitle>
                  <CardDescription>Patients with the most points</CardDescription>
                </CardHeader>
                <CardContent>
                  {analyticsLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                  ) : analytics?.topEarners?.length ? (
                    <div className="space-y-3">
                      {analytics.topEarners.map((earner, index) => {
                        const user = users.find(u => u.id === earner.userId);
                        return (
                          <div 
                            key={earner.userId} 
                            className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                            data-testid={`top-earner-${index}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                                {index + 1}
                              </div>
                              <div>
                                <p className="text-sm font-medium">
                                  {user?.firstName} {user?.lastName}
                                </p>
                                <p className="text-xs text-muted-foreground">{user?.email}</p>
                              </div>
                            </div>
                            <Badge variant="secondary">{earner.points.toLocaleString()} pts</Badge>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No top earners yet</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Quick Stats</CardTitle>
                  <CardDescription>Program overview</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Active Earning Rules</span>
                    <Badge>{earningRules.filter(r => r.isActive).length}</Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Available Rewards</span>
                    <Badge>{rewards.filter(r => r.status === "active").length}</Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Active Campaigns</span>
                    <Badge>{campaigns.filter(c => c.isActive).length}</Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Patients</span>
                    <Badge variant="outline">{users.length}</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Wallets Tab */}
          <TabsContent value="wallets" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Patient Wallets</CardTitle>
                <CardDescription>View and manage patient points wallets</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, email, or phone..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                      data-testid="input-search-wallets"
                    />
                  </div>
                </div>

                {usersLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No patients found
                  </div>
                ) : (
                  <>
                    {/* Desktop Table */}
                    <div className="overflow-x-auto hidden md:block">
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Patient</TableHead>
                              <TableHead>Email</TableHead>
                              <TableHead>Phone</TableHead>
                              <TableHead className="text-right">Points</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredUsers.slice(0, 50).map((user) => (
                              <TableRow key={user.id} data-testid={`wallet-row-${user.id}`}>
                                <TableCell className="font-medium">
                                  {user.firstName} {user.lastName}
                                </TableCell>
                                <TableCell>{user.email || "-"}</TableCell>
                                <TableCell>{user.phoneNumber || "-"}</TableCell>
                                <TableCell className="text-right">
                                  <Badge variant="secondary">
                                    {(user.loyaltyPoints || 0).toLocaleString()} pts
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">Active</Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => openWalletDialog(user.id)}
                                      title="View Wallet"
                                      data-testid={`button-view-wallet-${user.id}`}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => openActionDialog(user.id, "award")}
                                      title="Award Points"
                                      data-testid={`button-award-${user.id}`}
                                    >
                                      <Plus className="h-4 w-4 text-green-600" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => openActionDialog(user.id, "deduct")}
                                      title="Deduct Points"
                                      data-testid={`button-deduct-${user.id}`}
                                    >
                                      <Minus className="h-4 w-4 text-red-600" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => openActionDialog(user.id, "freeze")}
                                      title="Freeze Wallet"
                                      data-testid={`button-freeze-${user.id}`}
                                    >
                                      <Lock className="h-4 w-4 text-orange-600" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-3">
                      {filteredUsers.slice(0, 50).map((user) => (
                        <Card key={user.id} data-testid={`wallet-card-${user.id}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div>
                                <p className="font-medium">{user.firstName} {user.lastName}</p>
                                <p className="text-sm text-muted-foreground">{user.email || "-"}</p>
                                {user.phoneNumber && (
                                  <p className="text-sm text-muted-foreground">{user.phoneNumber}</p>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <Badge variant="secondary">
                                  {(user.loyaltyPoints || 0).toLocaleString()} pts
                                </Badge>
                                <Badge variant="outline">Active</Badge>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 mt-3 pt-3 border-t">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openWalletDialog(user.id)}
                                title="View Wallet"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openActionDialog(user.id, "award")}
                                title="Award Points"
                              >
                                <Plus className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openActionDialog(user.id, "deduct")}
                                title="Deduct Points"
                              >
                                <Minus className="h-4 w-4 text-red-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openActionDialog(user.id, "freeze")}
                                title="Freeze Wallet"
                              >
                                <Lock className="h-4 w-4 text-orange-600" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Earning Rules Tab */}
          <TabsContent value="rules" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle>Earning Rules</CardTitle>
                  <CardDescription>Configure how patients earn points</CardDescription>
                </div>
                <Button onClick={() => setNewRuleDialogOpen(true)} data-testid="button-add-rule" className="w-full sm:w-auto">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Rule
                </Button>
              </CardHeader>
              <CardContent>
                {rulesLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {earningRules.map((rule) => (
                      <div
                        key={rule.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg border gap-3"
                        data-testid={`rule-${rule.id}`}
                      >
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-medium">{rule.name}</h4>
                            <Badge variant={rule.isActive ? "default" : "secondary"}>
                              {rule.isActive ? "Active" : "Inactive"}
                            </Badge>
                            {rule.isOneTime && (
                              <Badge variant="outline">One-Time</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{rule.description}</p>
                          <div className="flex flex-wrap items-center gap-4 mt-2">
                            {rule.basePoints > 0 && (
                              <span className="text-sm">
                                <strong>{rule.basePoints}</strong> base points
                              </span>
                            )}
                            {rule.pointsPerDollar && (
                              <span className="text-sm">
                                <strong>{rule.pointsPerDollar}</strong> pts/dollar
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0">
                          <Switch
                            checked={rule.isActive}
                            onCheckedChange={(checked) => {
                              updateRuleMutation.mutate({
                                id: rule.id,
                                updates: { isActive: checked },
                              });
                            }}
                            data-testid={`switch-rule-${rule.id}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedRule(rule);
                              setEditRuleDialogOpen(true);
                            }}
                            data-testid={`button-edit-rule-${rule.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteRuleMutation.mutate(rule.id)}
                            data-testid={`button-delete-rule-${rule.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {earningRules.length === 0 && (
                      <div className="text-center py-8">
                        <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-muted-foreground">No earning rules configured yet</p>
                        <Button variant="outline" className="mt-4" onClick={() => setNewRuleDialogOpen(true)}>
                          Create First Rule
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Rewards Catalog Tab */}
          <TabsContent value="rewards" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle>Rewards Catalog</CardTitle>
                  <CardDescription>Manage available rewards for redemption</CardDescription>
                </div>
                <Button onClick={() => setNewRewardDialogOpen(true)} data-testid="button-add-reward" className="w-full sm:w-auto">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Reward
                </Button>
              </CardHeader>
              <CardContent>
                {rewardsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
                  </div>
                ) : rewards.length === 0 ? (
                  <div className="text-center py-8">
                    <Gift className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No rewards created yet</p>
                    <Button variant="outline" className="mt-4" onClick={() => setNewRewardDialogOpen(true)}>
                      Create First Reward
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {rewards.map((reward) => (
                      <Card key={reward.id} className="relative" data-testid={`reward-card-${reward.id}`}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <CardTitle className="text-base">{reward.name}</CardTitle>
                              <Badge variant={reward.status === "active" ? "default" : "secondary"} className="mt-1">
                                {reward.status === "active" ? "Active" : reward.status}
                              </Badge>
                            </div>
                            <Badge variant="outline" className="whitespace-nowrap">
                              {reward.pointsCost} pts
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground mb-3">{reward.description}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                            <span>Type: {reward.rewardType.replace("_", " ")}</span>
                            {reward.maxRedemptionsTotal !== null && (
                              <span>| Limit: {reward.currentRedemptions}/{reward.maxRedemptionsTotal}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedReward(reward);
                                setEditRewardDialogOpen(true);
                              }}
                              data-testid={`button-edit-reward-${reward.id}`}
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteRewardMutation.mutate(reward.id)}
                              data-testid={`button-delete-reward-${reward.id}`}
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <AnalyticsTab />
          </TabsContent>
        </Tabs>

        {/* Wallet Details Dialog */}
        <Dialog open={walletDialogOpen} onOpenChange={setWalletDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Wallet Details</DialogTitle>
              <DialogDescription>
                View transaction history and wallet status
              </DialogDescription>
            </DialogHeader>
            
            {walletError ? (
              <div className="p-4 bg-destructive/10 text-destructive rounded-md" role="alert">
                <p className="text-sm font-medium">Failed to load wallet</p>
                <p className="text-xs mt-1">{(walletError as Error).message}</p>
              </div>
            ) : walletLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                  <div className="p-4 rounded-lg bg-muted">
                    <p className="text-sm text-muted-foreground">Current Balance</p>
                    <p className="text-2xl font-bold">{selectedWallet?.currentBalance || 0}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted">
                    <p className="text-sm text-muted-foreground">Lifetime Earned</p>
                    <p className="text-2xl font-bold">{selectedWallet?.lifetimeEarned || 0}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted">
                    <p className="text-sm text-muted-foreground">Lifetime Redeemed</p>
                    <p className="text-2xl font-bold">{selectedWallet?.lifetimeRedeemed || 0}</p>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Transaction History
                  </h4>
                  {ledgerLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                    </div>
                  ) : ledgerError ? (
                    <p className="text-sm text-destructive" role="alert">
                      Failed to load transaction history: {(ledgerError as Error).message}
                    </p>
                  ) : selectedLedger.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No transactions yet</p>
                  ) : (
                    <>
                      {/* Desktop Transaction Table */}
                      <div className="rounded-md border max-h-60 overflow-y-auto hidden sm:block">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead className="text-right">Points</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedLedger.map((entry) => (
                              <TableRow key={entry.id}>
                                <TableCell className="text-sm">{formatDate(entry.createdAt)}</TableCell>
                                <TableCell>
                                  <Badge variant={entry.points > 0 ? "default" : "secondary"}>
                                    {entry.points > 0 ? "earn" : "spend"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm">{entry.description}</TableCell>
                                <TableCell className={`text-right font-medium ${entry.points > 0 ? "text-green-600" : "text-red-600"}`}>
                                  {entry.points > 0 ? "+" : ""}{entry.points}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Mobile Transaction Cards */}
                      <div className="sm:hidden space-y-2 max-h-60 overflow-y-auto">
                        {selectedLedger.map((entry) => (
                          <div key={entry.id} className="p-3 rounded-lg border">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="text-sm font-medium">{entry.description}</p>
                                <p className="text-xs text-muted-foreground mt-1">{formatDate(entry.createdAt)}</p>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <Badge variant={entry.points > 0 ? "default" : "secondary"}>
                                  {entry.points > 0 ? "earn" : "spend"}
                                </Badge>
                                <span className={`text-sm font-medium ${entry.points > 0 ? "text-green-600" : "text-red-600"}`}>
                                  {entry.points > 0 ? "+" : ""}{entry.points}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Action Dialog (Award/Deduct/Freeze) */}
        <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {actionType === "award" && "Award Points"}
                {actionType === "deduct" && "Deduct Points"}
                {actionType === "freeze" && "Freeze Wallet"}
                {actionType === "unfreeze" && "Unfreeze Wallet"}
              </DialogTitle>
              <DialogDescription>
                {actionType === "award" && "Add points to this patient's wallet"}
                {actionType === "deduct" && "Remove points from this patient's wallet"}
                {actionType === "freeze" && "Freeze this wallet to prevent all transactions"}
                {actionType === "unfreeze" && "Unfreeze this wallet to allow transactions"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {(actionType === "award" || actionType === "deduct") && (
                <div className="space-y-2">
                  <Label>Points</Label>
                  <Input
                    type="number"
                    min="0"
                    value={actionPoints}
                    onChange={(e) => setActionPoints(e.target.value)}
                    placeholder="Enter points amount"
                    data-testid="input-action-points"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Enter reason for this action..."
                  data-testid="input-action-reason"
                />
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setActionDialogOpen(false)} className="w-full sm:w-auto">
                Cancel
              </Button>
              {actionType === "unfreeze" ? (
                <Button onClick={handleUnfreeze} disabled={unfreezeMutation.isPending} className="w-full sm:w-auto">
                  {unfreezeMutation.isPending ? "Processing..." : "Unfreeze Wallet"}
                </Button>
              ) : (
                <Button 
                  onClick={handleAction}
                  disabled={awardMutation.isPending || deductMutation.isPending}
                  variant={actionType === "deduct" || actionType === "freeze" ? "destructive" : "default"}
                  data-testid="button-confirm-action"
                  className="w-full sm:w-auto"
                >
                  {(awardMutation.isPending || deductMutation.isPending) ? "Processing..." : "Confirm"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirm Freeze Dialog */}
        <AlertDialog open={confirmFreezeOpen} onOpenChange={setConfirmFreezeOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Freeze Wallet?</AlertDialogTitle>
              <AlertDialogDescription>
                This will prevent the patient from earning or redeeming any points. Are you sure you want to continue?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleFreeze} className="bg-destructive text-destructive-foreground">
                Freeze Wallet
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Edit Rule Dialog */}
        <Dialog open={editRuleDialogOpen} onOpenChange={setEditRuleDialogOpen}>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Earning Rule</DialogTitle>
              <DialogDescription>Modify the earning rule settings</DialogDescription>
            </DialogHeader>
            {selectedRule && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Rule Name</Label>
                  <Input value={selectedRule.name} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Base Points</Label>
                  <Input
                    type="number"
                    min="1"
                    defaultValue={selectedRule.basePoints}
                    onChange={(e) => setSelectedRule({...selectedRule, basePoints: parseInt(e.target.value) || 0})}
                    data-testid="input-rule-points"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={selectedRule.isActive}
                    onCheckedChange={(checked) => setSelectedRule({...selectedRule, isActive: checked})}
                  />
                  <Label>Active</Label>
                </div>
              </div>
            )}
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setEditRuleDialogOpen(false)} className="w-full sm:w-auto">Cancel</Button>
              <Button 
                onClick={() => {
                  if (selectedRule) {
                    if (!Number.isInteger(selectedRule.basePoints) || selectedRule.basePoints < 0) {
                      toast({ title: "Invalid points", description: "Base points must be a whole number of zero or more.", variant: "destructive" });
                      return;
                    }
                    updateRuleMutation.mutate({
                      id: selectedRule.id,
                      updates: { basePoints: selectedRule.basePoints, isActive: selectedRule.isActive },
                    });
                  }
                }}
                disabled={updateRuleMutation.isPending}
                className="w-full sm:w-auto"
              >
                {updateRuleMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New Rule Dialog */}
        <NewRuleDialog 
          open={newRuleDialogOpen} 
          onOpenChange={setNewRuleDialogOpen}
          onSubmit={(data) => createRuleMutation.mutate(data)}
          isPending={createRuleMutation.isPending}
        />

        {/* New Reward Dialog */}
        <NewRewardDialog 
          open={newRewardDialogOpen} 
          onOpenChange={setNewRewardDialogOpen}
          onSubmit={(data) => createRewardMutation.mutate(data)}
          isPending={createRewardMutation.isPending}
        />

        {/* Edit Reward Dialog */}
        {selectedReward && (
          <EditRewardDialog
            open={editRewardDialogOpen}
            onOpenChange={setEditRewardDialogOpen}
            reward={selectedReward}
            onSubmit={(updates) => updateRewardMutation.mutate({ id: selectedReward.id, updates })}
            isPending={updateRewardMutation.isPending}
          />
        )}
      </div>
    </AdminLayout>
  );
}

const ACTION_TYPES = [
  { value: "on_time_refill", label: "On-Time Refill" },
  { value: "perfect_adherence_month", label: "Perfect Adherence Month" },
  { value: "streak_3_refills", label: "3-Refill Streak" },
  { value: "streak_5_refills", label: "5-Refill Streak" },
  { value: "streak_10_refills", label: "10-Refill Streak" },
  { value: "weekly_app_engagement", label: "Weekly App Engagement" },
  { value: "enable_delivery", label: "Enable Delivery" },
  { value: "profile_completion", label: "Profile Completion" },
  { value: "otc_purchase", label: "OTC Purchase" },
  { value: "delivery_completed", label: "Delivery Completed" },
  { value: "vaccine_completed", label: "Vaccine Completed" },
  { value: "prescription_transfer", label: "Prescription Transfer" },
  { value: "referral_completed", label: "Referral Completed" },
  { value: "signup_bonus", label: "Signup Bonus" },
  { value: "campaign_bonus", label: "Campaign Bonus" },
];

function NewRuleDialog({ 
  open, 
  onOpenChange, 
  onSubmit, 
  isPending 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const [formData, setFormData] = useState({
    name: "",
    actionType: "on_time_refill",
    description: "",
    basePoints: 50,
    pointsPerDollar: "",
    isOneTime: false,
    isActive: true,
  });

  const handleSubmit = () => {
    const trimmedName = formData.name.trim();
    if (!trimmedName) return;
    
    // Generate unique ruleKey from name + timestamp to ensure uniqueness
    const ruleKey = `${trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${Date.now()}`;
    
    const submitData = {
      name: trimmedName,
      ruleKey,
      actionType: formData.actionType,
      description: formData.description?.trim() || undefined,
      basePoints: Math.floor(Number(formData.basePoints) || 0), // Ensure integer
      isOneTime: formData.isOneTime,
      isActive: formData.isActive,
      pointsPerDollar: formData.pointsPerDollar?.trim() || undefined,
    };
    
    onSubmit(submitData);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      actionType: "on_time_refill",
      description: "",
      basePoints: 50,
      pointsPerDollar: "",
      isOneTime: false,
      isActive: true,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetForm();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Earning Rule</DialogTitle>
          <DialogDescription>Define how patients can earn points</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-2">
            <Label>Rule Name</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="e.g., On-Time Refill Bonus"
              data-testid="input-rule-name"
            />
          </div>
          <div className="space-y-2">
            <Label>Action Type</Label>
            <Select
              value={formData.actionType}
              onValueChange={(value) => setFormData({...formData, actionType: value})}
            >
              <SelectTrigger data-testid="select-action-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Describe when and how this rule awards points"
              data-testid="input-rule-description"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Base Points</Label>
              <Input
                type="number"
                value={formData.basePoints}
                onChange={(e) => setFormData({...formData, basePoints: parseInt(e.target.value) || 0})}
                data-testid="input-base-points"
              />
            </div>
            <div className="space-y-2">
              <Label>Points per Dollar (optional)</Label>
              <Input
                type="text"
                value={formData.pointsPerDollar}
                onChange={(e) => setFormData({...formData, pointsPerDollar: e.target.value})}
                placeholder="e.g., 1.00"
                data-testid="input-points-per-dollar"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.isOneTime}
                onCheckedChange={(checked) => setFormData({...formData, isOneTime: checked})}
                data-testid="switch-one-time"
              />
              <Label>One-Time Only</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({...formData, isActive: checked})}
                data-testid="switch-active"
              />
              <Label>Active</Label>
            </div>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">Cancel</Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isPending || !formData.name.trim()}
            data-testid="button-create-rule"
            className="w-full sm:w-auto"
          >
            {isPending ? "Creating..." : "Create Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewRewardDialog({ 
  open, 
  onOpenChange, 
  onSubmit, 
  isPending 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    pointsCost: 100,
    rewardType: "otc_discount" as const,
    discountValue: "",
    stockQuantity: "",
  });

  const handleSubmit = () => {
    const submitData: any = {
      name: formData.name,
      description: formData.description || undefined,
      pointsCost: formData.pointsCost,
      rewardType: formData.rewardType,
    };
    
    // Only include discountValue if it has a value (API expects string)
    if (formData.discountValue) {
      submitData.discountValue = formData.discountValue;
    }
    
    // Stock quantity would be maxRedemptionsTotal in the API
    if (formData.stockQuantity) {
      submitData.maxRedemptionsTotal = parseInt(formData.stockQuantity);
    }
    
    onSubmit(submitData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Reward</DialogTitle>
          <DialogDescription>Add a new reward to the catalog</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Reward Name</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="e.g., $5 Off OTC Products"
              data-testid="input-reward-name"
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Describe the reward..."
              data-testid="input-reward-description"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Points Cost</Label>
              <Input
                type="number"
                min="1"
                value={formData.pointsCost}
                onChange={(e) => setFormData({...formData, pointsCost: parseInt(e.target.value) || 0})}
                data-testid="input-reward-cost"
              />
            </div>
            <div className="space-y-2">
              <Label>Reward Type</Label>
              <Select 
                value={formData.rewardType}
                onValueChange={(value: any) => setFormData({...formData, rewardType: value})}
              >
                <SelectTrigger data-testid="select-reward-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="otc_discount">OTC Discount</SelectItem>
                  <SelectItem value="delivery_waiver">Free Delivery</SelectItem>
                  <SelectItem value="copay_assistance">Copay Assistance</SelectItem>
                  <SelectItem value="points_multiplier">Points Multiplier</SelectItem>
                  <SelectItem value="free_item">Free Item</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Discount Value ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.discountValue}
                onChange={(e) => setFormData({...formData, discountValue: e.target.value})}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label>Stock Quantity</Label>
              <Input
                type="number"
                min="0"
                value={formData.stockQuantity}
                onChange={(e) => setFormData({...formData, stockQuantity: e.target.value})}
                placeholder="Unlimited"
              />
            </div>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending || !formData.name} className="w-full sm:w-auto">
            {isPending ? "Creating..." : "Create Reward"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditRewardDialog({ 
  open, 
  onOpenChange, 
  reward,
  onSubmit, 
  isPending 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  reward: Reward;
  onSubmit: (updates: Partial<Reward>) => void;
  isPending: boolean;
}) {
  const [formData, setFormData] = useState({
    name: reward.name,
    description: reward.description || "",
    pointsCost: reward.pointsCost,
    status: reward.status as "active" | "inactive" | "expired",
    maxRedemptionsTotal: reward.maxRedemptionsTotal?.toString() || "",
    discountValue: reward.discountValue?.toString() || "",
  });

  const handleSubmit = () => {
    onSubmit({
      name: formData.name,
      description: formData.description,
      pointsCost: formData.pointsCost,
      status: formData.status,
      maxRedemptionsTotal: formData.maxRedemptionsTotal ? parseInt(formData.maxRedemptionsTotal) : null,
      discountValue: formData.discountValue ? formData.discountValue : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Reward</DialogTitle>
          <DialogDescription>Update reward details</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Reward Name</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Points Cost</Label>
              <Input
                type="number"
                min="1"
                value={formData.pointsCost}
                onChange={(e) => setFormData({...formData, pointsCost: parseInt(e.target.value) || 0})}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Redemptions</Label>
              <Input
                type="number"
                min="0"
                value={formData.maxRedemptionsTotal}
                onChange={(e) => setFormData({...formData, maxRedemptionsTotal: e.target.value})}
                placeholder="Unlimited"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select 
              value={formData.status}
              onValueChange={(value: "active" | "inactive" | "expired") => setFormData({...formData, status: value})}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending} className="w-full sm:w-auto">
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Analytics Tab Component
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Shield, DollarSign } from "lucide-react";

interface GamificationAnalytics {
  adherenceStats: {
    onTimeRefillRate: number;
    avgStreakLength: number;
    usersWithActiveStreaks: number;
    totalStreakBreaks30Days: number;
  };
  streakRetention: { day: number; retention: number }[];
  rewardsROI: {
    pointsIssued: number;
    estimatedCostUSD: number;
    refillsGenerated: number;
    revenueGenerated: number;
  };
  flaggedUsersCount: number;
  gamingIncidents30Days: number;
}

function AnalyticsTab() {
  const { data: analytics, isLoading, error } = useQuery<GamificationAnalytics>({
    queryKey: ["/api/admin/points/gamification-analytics"],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const roiPercentage = analytics?.rewardsROI 
    ? ((analytics.rewardsROI.revenueGenerated - analytics.rewardsROI.estimatedCostUSD) / 
       Math.max(analytics.rewardsROI.estimatedCostUSD, 1) * 100).toFixed(0)
    : "0";

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-md" role="alert">
          <p className="text-sm font-medium">Failed to load gamification analytics</p>
          <p className="text-xs mt-1">{(error as Error).message}</p>
        </div>
      )}
      {/* Adherence Stats */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">On-Time Refill Rate</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-refill-rate">
              {analytics?.adherenceStats.onTimeRefillRate || 0}%
            </div>
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Streak Length</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-streak">
              {analytics?.adherenceStats.avgStreakLength || 0} days
            </div>
            <p className="text-xs text-muted-foreground">
              {analytics?.adherenceStats.usersWithActiveStreaks || 0} active streaks
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Streak Breaks</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-streak-breaks">
              {analytics?.adherenceStats.totalStreakBreaks30Days || 0}
            </div>
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gaming Incidents</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600" data-testid="text-gaming-incidents">
              {analytics?.gamingIncidents30Days || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {analytics?.flaggedUsersCount || 0} flagged users
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Streak Retention Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Streak Retention Curve</CardTitle>
          <CardDescription>
            Percentage of users maintaining refill streaks over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics?.streakRetention || []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="day" 
                  tick={{ fontSize: 12 }} 
                  label={{ value: "Day", position: "insideBottom", offset: -5 }}
                />
                <YAxis 
                  tick={{ fontSize: 12 }} 
                  label={{ value: "Retention %", angle: -90, position: "insideLeft" }}
                />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="retention" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ROI Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Rewards ROI Analysis
          </CardTitle>
          <CardDescription>
            Return on investment for the loyalty program
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <div className="p-4 rounded-lg bg-muted">
              <p className="text-sm text-muted-foreground">Points Issued</p>
              <p className="text-2xl font-bold">
                {analytics?.rewardsROI.pointsIssued.toLocaleString() || 0}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted">
              <p className="text-sm text-muted-foreground">Estimated Cost</p>
              <p className="text-2xl font-bold">
                ${analytics?.rewardsROI.estimatedCostUSD.toLocaleString() || 0}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted">
              <p className="text-sm text-muted-foreground">Refills Generated</p>
              <p className="text-2xl font-bold">
                {analytics?.rewardsROI.refillsGenerated.toLocaleString() || 0}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted">
              <p className="text-sm text-muted-foreground">Revenue Generated</p>
              <p className="text-2xl font-bold text-green-600">
                ${analytics?.rewardsROI.revenueGenerated.toLocaleString() || 0}
              </p>
            </div>
          </div>
          <Separator className="my-4" />
          <div className="flex items-center justify-between">
            <span className="text-lg font-medium">Net ROI</span>
            <Badge className={parseInt(roiPercentage) >= 0 ? "bg-green-600" : "bg-red-600"}>
              {parseInt(roiPercentage) >= 0 ? "+" : ""}{roiPercentage}%
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
