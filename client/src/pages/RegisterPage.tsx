import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiRequestError } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";

const schema = z
  .object({
    fullName: z.string().min(2, "Full name is required."),
    email: z.string().email("Enter a valid email address."),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .regex(/[A-Za-z]/, "Include at least one letter.")
      .regex(/[0-9]/, "Include at least one number."),
    confirmPassword: z.string(),
    role: z.string().min(2, "Professional role is required."),
    organizationName: z.string().min(2, "Organization/clinic name is required."),
  })
  .refine((d) => d.password === d.confirmPassword, { message: "Passwords do not match.", path: ["confirmPassword"] });
type FormValues = z.infer<typeof schema>;

export function RegisterPage() {
  const { isAuthenticated, refetch } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (isAuthenticated) return <Navigate to="/" replace />;

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    setSubmitting(true);
    try {
      await api.post("/auth/register", values);
      await refetch();
      navigate("/", { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiRequestError ? err.message : "Unable to create your account. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Stethoscope className="h-5.5 w-5.5" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Create your clinical workspace</h1>
          <p className="text-sm text-muted">Set up a new organization on Clinote</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="rounded-lg border border-border bg-surface p-6 shadow-card">
          {serverError && <div role="alert" className="mb-4 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{serverError}</div>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" {...register("fullName")} />
              {errors.fullName && <p className="text-xs text-danger">{errors.fullName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role">Professional role</Label>
              <Input id="role" placeholder="e.g. Physician" {...register("role")} />
              {errors.role && <p className="text-xs text-danger">{errors.role.message}</p>}
            </div>
          </div>

          <div className="mt-4 space-y-1.5">
            <Label htmlFor="organizationName">Organization / clinic name</Label>
            <Input id="organizationName" {...register("organizationName")} />
            {errors.organizationName && <p className="text-xs text-danger">{errors.organizationName.message}</p>}
          </div>

          <div className="mt-4 space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
            {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
              {errors.password && <p className="text-xs text-danger">{errors.password.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input id="confirmPassword" type="password" autoComplete="new-password" {...register("confirmPassword")} />
              {errors.confirmPassword && <p className="text-xs text-danger">{errors.confirmPassword.message}</p>}
            </div>
          </div>

          <Button type="submit" className="mt-5 w-full" loading={submitting}>
            {submitting ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
