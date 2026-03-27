import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Catalog from "./pages/Catalog";
import History from "./pages/History";
import Violations from "./pages/Violations";
import Alerts from "./pages/Alerts";
import Settings from "./pages/Settings";
import Revendedores from "./pages/Clientes";
import MercadoLivre from "./pages/MercadoLivre";
import BrowserCheck from "./pages/BrowserCheck";
import Ingestion from "./pages/Ingestion";
import TrackedListings from "./pages/TrackedListings";
import ReviewQueue from "./pages/ReviewQueue";
import NotFound from "./pages/NotFound";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/violations" component={Violations} />
        <Route path="/revendedores" component={Revendedores} />
        <Route path="/catalog" component={Catalog} />
        <Route path="/history" component={History} />
        <Route path="/alerts" component={Alerts} />
        <Route path="/settings" component={Settings} />
        <Route path="/ml" component={MercadoLivre} />
        <Route path="/browser-check" component={BrowserCheck} />
        <Route path="/ingestion" component={Ingestion} />
        <Route path="/tracked" component={TrackedListings} />
        <Route path="/review" component={ReviewQueue} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster richColors theme="dark" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
