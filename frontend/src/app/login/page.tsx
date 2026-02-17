"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { Background } from "@/components/background";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";

const Login = () => {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      toast.success("Signed in");
      router.push("/companies");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid email or password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Background>
      <section className="py-28 lg:pt-44 lg:pb-32">
        <div className="container">
          <div className="flex flex-col gap-4">
            <Card className="mx-auto w-full max-w-sm">
              <CardHeader className="flex flex-col items-center space-y-0">
                <span className="font-display mb-7 text-xl font-bold tracking-tight">
                  Jarvis
                </span>
                <p className="mb-2 text-2xl font-bold">Welcome back</p>
                <p className="text-muted-foreground">
                  Sign in to access.
                </p>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="grid gap-4">
                  <Input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                  <Input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <Button
                    type="submit"
                    className="mt-2 w-full"
                    disabled={submitting}
                  >
                    {submitting ? "Signing in…" : "Sign in"}
                  </Button>
                </form>
                <div className="text-muted-foreground mx-auto mt-6 flex justify-center gap-1 text-sm">
                  <p>New Era Ventures admin access only.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </Background>
  );
};

export default Login;
