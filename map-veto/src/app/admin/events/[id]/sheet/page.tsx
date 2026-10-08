import {SheetMatchImport} from '@/components/admin/SheetMatchImport';
export default async function SheetPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <SheetMatchImport eventId={id}/>;}
