import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Key, LogOut } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { githubService } from "../services/githubAPI";
import { TokenSetup } from "./TokenSetup";

export function TokenButton() {
  const queryClient = useQueryClient();
  const [hasToken, setHasToken] = useState(githubService.hasToken());
  const [showSetup, setShowSetup] = useState(false);

  const handleRemoveToken = () => {
    githubService.removeToken();
    setHasToken(false);
    queryClient.invalidateQueries();
    toast.success("Token removed — data will be refetched");
  };

  const handleTokenSaved = () => {
    setHasToken(true);
    queryClient.invalidateQueries();
    toast.success("Token saved — refetching data");
  };

  if (!hasToken) {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => setShowSetup(true)}>
          <Key className="h-4 w-4 mr-2" />
          Setup Token
        </Button>
        <TokenSetup
          open={showSetup}
          onOpenChange={setShowSetup}
          onTokenSaved={handleTokenSaved}
        />
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
            Authenticated
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setShowSetup(true)}>
            <Key className="h-4 w-4 mr-2" />
            Update Token
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleRemoveToken}>
            <LogOut className="h-4 w-4 mr-2" />
            Remove Token
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TokenSetup
        open={showSetup}
        onOpenChange={setShowSetup}
        onTokenSaved={handleTokenSaved}
      />
    </>
  );
}
