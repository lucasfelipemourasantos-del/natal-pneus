import { useNavigate, Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import logoAsset from '@/assets/natal-pneus-logo.png.asset.json';
import { supabase } from '@/integrations/supabase/client';
import { homeFor, loadAccess } from '@/lib/access';
import { fieldClass } from '@/lib/portal-data';
export function LoginScreen() {
 const navigate=useNavigate(); const [recover,setRecover]=useState(false); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [notice,setNotice]=useState('');
 async function submit(e:FormEvent<HTMLFormElement>) {e.preventDefault();setBusy(true);setError('');setNotice('');const f=new FormData(e.currentTarget);try{
 const email=String(f.get('email')).trim();
 if(recover){const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+'/nova-senha'});if(error)throw error;setNotice('Se houver uma conta com este e-mail, enviaremos um link para recuperar a senha.');return;}
 const {error}=await supabase.auth.signInWithPassword({email,password:String(f.get('password'))});if(error)throw new Error('E-mail ou senha incorretos, ou e-mail ainda não confirmado.');const access=await loadAccess();if(!access)throw new Error('Não foi possível entrar.');await navigate({to:homeFor(access),replace:true});
 }catch(err){setError(err instanceof Error?err.message:'Não foi possível continuar.');}finally{setBusy(false);}}
 return <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12 text-foreground"><div className="w-full max-w-[380px]"><img src={logoAsset.url} alt="Natal Pneus" className="mx-auto h-auto w-[210px]"/><p className="mt-5 text-center text-xs font-semibold uppercase text-muted-foreground">Portal Natal Pneus</p><h1 className="mt-10 text-2xl font-semibold">{recover?'Recuperar senha':'Bem-vindo de volta'}</h1><form onSubmit={submit} className="mt-6 space-y-5"><label className="block text-sm font-medium">E-mail<input name="email" type="email" autoComplete="email" maxLength={255} required className={fieldClass}/></label>{!recover&&<label className="block text-sm font-medium">Senha<input name="password" type="password" autoComplete="current-password" required className={fieldClass}/></label>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{notice&&<p role="status" className="text-sm text-success">{notice}</p>}<Button disabled={busy} className="min-h-11 w-full">{busy?'Aguarde…':recover?'Enviar link':'Entrar'}</Button></form><div className="mt-4 flex flex-wrap items-center justify-between gap-2"><Button variant="link" className="px-0" onClick={()=>{setRecover(!recover);setError('');setNotice('');}}>{recover?'Voltar para entrar':'Esqueci minha senha'}</Button><Button asChild variant="link" className="px-0"><Link to="/cadastro">Criar cadastro</Link></Button></div></div></main>;
}
