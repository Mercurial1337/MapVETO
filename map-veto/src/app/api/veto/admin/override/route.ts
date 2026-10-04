import { NextRequest } from 'next/server';
import { adminAction } from '@/lib/veto/adminAction';
export function POST(request:NextRequest) {return adminAction(request);}
