import Link from 'next/link';
import { redirect } from 'next/navigation';

export default function DemoPage() {
    // Redirect to a mock match page with demo mode
    redirect('/match/demo-match');
}
