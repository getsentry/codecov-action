import { AlertCircle, Home } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 flex flex-1 items-center justify-center py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <CardTitle>Page Not Found</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            The page you're looking for doesn't exist or the repository cannot
            be found.
          </p>
          <p className="text-sm text-muted-foreground">
            To view a repository's coverage dashboard, navigate to:
          </p>
          <code className="block p-2 bg-muted rounded text-sm">
            /:owner/:repo
          </code>
          <p className="text-sm text-muted-foreground">
            Example:{" "}
            <Link
              to="/getsentry/codecov-action"
              className="text-primary hover:underline"
            >
              /getsentry/codecov-action
            </Link>
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/">
              <Home className="h-4 w-4 mr-2" />
              Back to Home
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
