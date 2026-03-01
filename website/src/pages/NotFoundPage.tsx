import { AlertCircle, Home, Key, Lock, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TokenSetup } from "../components/TokenSetup";
import { githubService } from "../services/githubAPI";

export default function NotFoundPage() {
  const [showSetup, setShowSetup] = useState(false);
  const hasToken = githubService.hasToken();

  return (
    <div className="mx-auto max-w-7xl px-6 flex flex-1 items-center justify-center py-16">
      <div className="w-full max-w-lg space-y-6">
        {/* Main error card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <CardTitle>Unable to Access Repository</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  We couldn't load the page you requested
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This usually happens for one of the following reasons:
            </p>

            {/* Reason cards */}
            <div className="space-y-3">
              <div className="flex gap-3 rounded-lg border p-3">
                <Lock className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Private repository</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    The repository may be private. Authenticate with a GitHub
                    token that has access to view it.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 rounded-lg border p-3">
                <Search className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Repository not found</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    The owner or repository name may be incorrect. Double-check
                    the URL follows the format{" "}
                    <code className="bg-muted px-1 py-0.5 rounded">
                      /owner/repo
                    </code>
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-2">
              {!hasToken && (
                <Button onClick={() => setShowSetup(true)}>
                  <Key className="h-4 w-4 mr-2" />
                  Add GitHub Token
                </Button>
              )}
              <Button asChild variant={hasToken ? "default" : "outline"}>
                <Link to="/">
                  <Home className="h-4 w-4 mr-2" />
                  Search for a Repository
                </Link>
              </Button>
            </div>

            {/* Example */}
            <p className="text-xs text-center text-muted-foreground pt-1">
              Try an example:{" "}
              <Link
                to="/getsentry/codecov-action"
                className="text-primary hover:underline"
              >
                getsentry/codecov-action
              </Link>
            </p>
          </CardContent>
        </Card>

        <TokenSetup
          open={showSetup}
          onOpenChange={setShowSetup}
          onTokenSaved={() => {
            toast.success(
              "Token saved — try navigating to the repository again",
            );
          }}
        />
      </div>
    </div>
  );
}
