import { supabase } from "@/integrations/supabase/client";

export function authErrorMessage(error: { code?: string | undefined; status?: number | undefined }, action: "login" | "signup" | "reset") {
  if (error.code === "email_not_confirmed") return "Confirme seu e-mail pelo link recebido antes de entrar.";
  if (error.code === "same_password") return "Escolha uma senha diferente da senha anterior.";
  if (error.code === "weak_password") return "Escolha uma senha mais forte, com pelo menos 8 caracteres.";
  if (error.status === 429) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (action === "login") return "E-mail ou senha incorretos. Confira os dados ou solicite a recuperação de senha.";
  if (action === "signup") return "Não foi possível enviar o cadastro. Confira os dados e tente novamente.";
  return "O link expirou ou já foi utilizado. Solicite um novo link de recuperação.";
}

export function recoveryAllowed(linkRecovery: boolean, eventRecovery: boolean, sessionValid: boolean) {
  return sessionValid && (linkRecovery || eventRecovery);
}

/** The SDK consumes implicit links; wait for that initialization before validating the user. */
export async function resolveEmailLink(recovery: boolean) {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.slice(1));
  let fromRecoveryEvent = false;
  const { data: listener } = supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") fromRecoveryEvent = true;
  });
  try {
    if (hash.has("error") || url.searchParams.has("error")) throw new Error("invalid_link");
    const tokenHash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type");
    let verifiedRecovery = false;
    if (tokenHash && (type === "recovery" || type === "signup")) {
      const result = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (result.error) throw result.error;
      verifiedRecovery = type === "recovery";
    }
    const initial = await supabase.auth.getSession();
    if (initial.error) throw initial.error;
    const code = url.searchParams.get("code");
    if (code && !initial.data.session) {
      const result = await supabase.auth.exchangeCodeForSession(code);
      if (result.error) throw result.error;
      verifiedRecovery = recovery;
    }
    const user = await supabase.auth.getUser();
    if (user.error || !user.data.user) throw new Error("invalid_link");
    const implicitRecovery = hash.get("type") === "recovery" && hash.has("access_token");
    if (recovery && !recoveryAllowed(implicitRecovery || verifiedRecovery, fromRecoveryEvent, true)) {
      throw new Error("not_recovery");
    }
    window.history.replaceState(null, "", url.pathname);
    return user.data.user;
  } finally {
    listener.subscription.unsubscribe();
  }
}