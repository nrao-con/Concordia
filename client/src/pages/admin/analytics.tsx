import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Order, Product, Prescription } from "@shared/schema";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, DollarSign, ShoppingBag, Pill, Package, Users, Calendar, Smartphone, Globe, Eye, MessageCircle } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

type DateRange = "today" | "week" | "month" | "year";

export default function AdminAnalytics() {
  const [dateRange, setDateRange] = useState<DateRange>("month");

  const { data: orders = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["/api/admin/orders"],
  });

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: prescriptions = [], isLoading: prescriptionsLoading } = useQuery<Prescription[]>({
    queryKey: ["/api/admin/prescriptions"],
  });

  const { data: salesAnalysis = [], isLoading: salesLoading } = useQuery<Array<{ productId: string; productName: string; totalSold: number; revenue: number }>>({
    queryKey: ["/api/admin/products/sales-analysis"],
  });

  const { data: pageViewStats, isLoading: pageViewsLoading } = useQuery<{
    topPages: { path: string; views: number }[];
    dailyViews: { date: string; views: number }[];
    totalViews: number;
  }>({
    queryKey: ["/api/admin/page-views"],
  });

  const { data: analyticsSummary } = useQuery<{
    totalRevenue: number;
    totalOrders: number;
    bySource: Record<string, { revenue: number; orders: number }>;
  }>({
    queryKey: ["/api/admin/analytics"],
  });

  const { data: chatEventStats = [], isLoading: chatEventsLoading } = useQuery<
    { eventType: string; count: number }[]
  >({
    queryKey: ["/api/admin/chat-events"],
  });

  // Calculate metrics
  const totalRevenue = orders.reduce((sum, order) => sum + parseFloat(order.total), 0);
  const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;
  const totalOrders = orders.length;
  const completedOrders = orders.filter((o) => o.status === "completed").length;

  // Calculate real chart data from orders
  const monthlyRevenue = (() => {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const revenueByMonth: { [key: string]: number } = {};
    
    // Get last 6 months
    const now = new Date();
    const last6Months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { month: monthNames[d.getMonth()], year: d.getFullYear(), key: `${d.getFullYear()}-${d.getMonth()}` };
    });
    
    // Initialize all months with 0
    last6Months.forEach(({ key }) => {
      revenueByMonth[key] = 0;
    });
    
    // Aggregate revenue by month
    orders.forEach(order => {
      const orderDate = new Date(order.createdAt);
      const key = `${orderDate.getFullYear()}-${orderDate.getMonth()}`;
      if (revenueByMonth.hasOwnProperty(key)) {
        revenueByMonth[key] += parseFloat(order.total);
      }
    });
    
    return last6Months.map(({ month, key }) => ({
      month,
      revenue: Math.round(revenueByMonth[key] * 100) / 100,
    }));
  })();

  const ordersByType = [
    { type: "Prescription", count: orders.filter((o) => o.type === "prescription").length },
    { type: "OTC", count: orders.filter((o) => o.type === "otc").length },
    { type: "Mixed", count: orders.filter((o) => o.type === "mixed").length },
  ];

  // Calculate top products from actual sales data
  const topProducts = salesAnalysis.slice(0, 5).map(p => ({
    name: p.productName,
    sales: p.totalSold,
  }));

  // Slow vs Fast mover analysis
  const avgSales = salesAnalysis.length > 0 
    ? salesAnalysis.reduce((sum, p) => sum + p.totalSold, 0) / salesAnalysis.length 
    : 0;
  
  const fastMovers = salesAnalysis.filter(p => p.totalSold > avgSales).slice(0, 5);
  const slowMovers = salesAnalysis.filter(p => p.totalSold <= avgSales).slice(-5).reverse();

  const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

  const SOURCE_COLORS: Record<string, string> = {
    website: "hsl(var(--chart-1))",
    app: "hsl(var(--chart-2))",
    in_store: "hsl(var(--chart-3))",
  };

  const salesByChannel = analyticsSummary?.bySource
    ? Object.entries(analyticsSummary.bySource).map(([source, data]) => ({
        name: source === "website" ? "Website" : source === "app" ? "App" : source === "in_store" ? "In-Store" : source,
        revenue: Math.round(data.revenue * 100) / 100,
        orders: data.orders,
        source,
      }))
    : [];

  return (
    <AdminLayout title="Analytics" backTo="/admin">
      <div className="container mx-auto p-6 space-y-6">
        {/* Date Range Filter */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-heading text-2xl font-bold">Analytics Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Performance metrics and business insights
            </p>
          </div>
          <Tabs value={dateRange} onValueChange={(value) => setDateRange(value as DateRange)} className="w-auto">
            <TabsList data-testid="tabs-date-range">
              <TabsTrigger value="today" data-testid="tab-today">
                <Calendar className="mr-2 h-4 w-4" />
                Today
              </TabsTrigger>
              <TabsTrigger value="week" data-testid="tab-week">Week</TabsTrigger>
              <TabsTrigger value="month" data-testid="tab-month">Month</TabsTrigger>
              <TabsTrigger value="year" data-testid="tab-year">Year</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Key Metrics */}
        <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-revenue">
                ${ordersLoading ? "-" : totalRevenue.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <TrendingUp className="h-3 w-3 text-green-600" />
                <span className="text-green-600">+12.5%</span> from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Order Value</CardTitle>
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-avg-order">
                ${ordersLoading ? "-" : avgOrderValue.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <TrendingUp className="h-3 w-3 text-green-600" />
                <span className="text-green-600">+8.2%</span> from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-orders">
                {ordersLoading ? "-" : totalOrders}
              </div>
              <p className="text-xs text-muted-foreground">
                {completedOrders} completed
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Sales by Channel */}
        {salesByChannel.length > 0 && (
          <div className="mb-8 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Revenue by Channel
                </CardTitle>
                <CardDescription>Revenue breakdown by sales channel</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={salesByChannel}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) =>
                        `${name}: ${(percent * 100).toFixed(0)}%`
                      }
                      outerRadius={100}
                      fill="hsl(245 57% 67%)"
                      dataKey="revenue"
                    >
                      {salesByChannel.map((entry) => (
                        <Cell key={`channel-${entry.source}`} fill={SOURCE_COLORS[entry.source] || COLORS[0]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  Channel Performance
                </CardTitle>
                <CardDescription>Orders and revenue per channel</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {salesByChannel.map((channel) => (
                    <div key={channel.source} className="flex items-center justify-between rounded-md border p-3" data-testid={`channel-${channel.source}`}>
                      <div className="flex items-center gap-3">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: SOURCE_COLORS[channel.source] || COLORS[0] }} />
                        <div>
                          <p className="font-medium">{channel.name}</p>
                          <p className="text-sm text-muted-foreground">{channel.orders} orders</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">${channel.revenue.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">
                          {analyticsSummary && analyticsSummary.totalRevenue > 0
                            ? `${((channel.revenue / analyticsSummary.totalRevenue) * 100).toFixed(1)}%`
                            : "0%"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Charts */}
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Trend</CardTitle>
              <CardDescription>Monthly revenue for the past 6 months</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={monthlyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Orders by Type</CardTitle>
              <CardDescription>Distribution of order types</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={ordersByType}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ type, percent }) =>
                      `${type}: ${(percent * 100).toFixed(0)}%`
                    }
                    outerRadius={100}
                    fill="hsl(245 57% 67%)"
                    dataKey="count"
                  >
                    {ordersByType.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Top Products</CardTitle>
              <CardDescription>Best selling products this month</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topProducts}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="sales" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Slow vs Fast Mover Analysis */}
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                Fast Movers
              </CardTitle>
              <CardDescription>Products selling above average ({avgSales.toFixed(0)} units)</CardDescription>
            </CardHeader>
            <CardContent>
              {salesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : fastMovers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sales data available</p>
              ) : (
                <div className="space-y-3">
                  {fastMovers.map((product, idx) => (
                    <div key={product.productId} className="flex items-center justify-between" data-testid={`fast-mover-${idx}`}>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="w-6 text-center">{idx + 1}</Badge>
                        <span className="font-medium">{product.productName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">{product.totalSold} sold</span>
                        <span className="text-sm font-medium text-green-600">${product.revenue.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-red-500" />
                Slow Movers
              </CardTitle>
              <CardDescription>Products selling below average ({avgSales.toFixed(0)} units)</CardDescription>
            </CardHeader>
            <CardContent>
              {salesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : slowMovers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sales data available</p>
              ) : (
                <div className="space-y-3">
                  {slowMovers.map((product, idx) => (
                    <div key={product.productId} className="flex items-center justify-between" data-testid={`slow-mover-${idx}`}>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="w-6 text-center">{idx + 1}</Badge>
                        <span className="font-medium">{product.productName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">{product.totalSold} sold</span>
                        <span className="text-sm font-medium text-muted-foreground">${product.revenue.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Page View Analytics */}
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Top Pages
              </CardTitle>
              <CardDescription>
                {pageViewStats ? `${pageViewStats.totalViews.toLocaleString()} total page views` : "Loading..."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pageViewsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-8" />
                  ))}
                </div>
              ) : !pageViewStats || pageViewStats.topPages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No page view data yet</p>
              ) : (
                <div className="space-y-2">
                  {pageViewStats.topPages.slice(0, 10).map((page, idx) => (
                    <div key={page.path} className="flex items-center justify-between rounded-md border p-2" data-testid={`page-view-row-${idx}`}>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="w-6 text-center">{idx + 1}</Badge>
                        <span className="font-medium text-sm truncate max-w-[200px]">{page.path}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">{page.views.toLocaleString()} views</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Daily Page Views
              </CardTitle>
              <CardDescription>Last 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              {pageViewsLoading ? (
                <Skeleton className="h-[300px]" />
              ) : !pageViewStats || pageViewStats.dailyViews.length === 0 ? (
                <p className="text-sm text-muted-foreground">No page view data yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={pageViewStats.dailyViews.map(d => ({ ...d, date: d.date.slice(5) }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="views" fill="hsl(var(--chart-2))" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Chat Widget Performance */}
        <div className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Chat Widget Performance
              </CardTitle>
              <CardDescription>All-time event counts from the Care Concierge widget</CardDescription>
            </CardHeader>
            <CardContent>
              {chatEventsLoading ? (
                <div className="flex gap-4">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 flex-1" />)}
                </div>
              ) : chatEventStats.length === 0 ? (
                <p className="text-sm text-muted-foreground">No chat events recorded yet. Events appear once patients interact with the widget.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-3">
                  {[
                    { key: "rx_redirect", label: "Rx Redirects", desc: "Times a user was directed to call for a prescription", color: "text-primary" },
                    { key: "fallback", label: "Unrecognised Messages", desc: "Times the bot did not understand the patient", color: "text-amber-500" },
                    { key: "call_click", label: "Call Me Back Clicks", desc: "Times a user requested a callback", color: "text-emerald-500" },
                  ].map(({ key, label, desc, color }) => {
                    const stat = chatEventStats.find((s) => s.eventType === key);
                    return (
                      <div key={key} className="rounded-md border p-4 space-y-1" data-testid={`chat-stat-${key}`}>
                        <p className={`text-2xl font-bold ${color}`}>{stat ? stat.count.toLocaleString() : "0"}</p>
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Additional Metrics */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Prescriptions</CardTitle>
              <Pill className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {prescriptionsLoading
                  ? "-"
                  : prescriptions.filter((p) => p.status === "active").length}
              </div>
              <p className="text-xs text-muted-foreground">Currently active</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Products in Stock</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {productsLoading ? "-" : products.filter((p) => p.inStock).length}
              </div>
              <p className="text-xs text-muted-foreground">Available products</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {ordersLoading ? "-" : totalOrders > 0 ? `${((completedOrders / totalOrders) * 100).toFixed(1)}%` : "0%"}
              </div>
              <p className="text-xs text-muted-foreground">Orders completed</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
