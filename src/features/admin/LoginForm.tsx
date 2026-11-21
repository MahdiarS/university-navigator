"use client";
import { LogIn } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { signInAction, type LoginState } from "@/lib/admin/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signInAction, { error: null });
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">ایمیل</label>
        <input id="email" name="email" type="email" autoComplete="username" required dir="ltr"
          className="min-h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-start focus:border-blue-600" />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">گذرواژه</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required dir="ltr"
          className="min-h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-start focus:border-blue-600" />
      </div>
      {state.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        <LogIn className="size-5" aria-hidden />
        {pending ? "در حال ورود…" : "ورود"}
      </Button>
    </form>
  );
}
