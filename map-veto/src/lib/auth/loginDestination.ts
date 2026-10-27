/** Only local match URLs may be used as post-login destinations. */
export function loginDestination(value:string|null):string {
 if(!value || !value.startsWith('/match/'))return '/admin';
 try{
  const url=new URL(value,'https://local.invalid');
  if(url.origin!=='https://local.invalid' || !/^\/match\/[0-9a-f-]{36}$/i.test(url.pathname) || !/^[0-9a-f-]{36}$/i.test(url.searchParams.get('token')||''))return '/admin';
  return url.pathname+'?token='+encodeURIComponent(url.searchParams.get('token')!);
 }catch{return '/admin';}
}
