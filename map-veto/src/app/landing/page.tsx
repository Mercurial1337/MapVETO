const services=[
 {title:'Map Veto',description:'Create matches, check in teams, and run live map vetoes.',href:'https://mapveto.emeaclash.com'},
 {title:'Live Graphics',description:'Broadcast overlays for tournament streams.',href:'https://graphics.emeaclash.com'},
 {title:'OnSync Timer',description:'Synchronized tournament countdowns.',href:'https://onsync.emeaclash.com'}
];
export default function LandingPage() {
 return <main className="max-w-3xl mx-auto px-5 py-12">
  <header className="border-b border-white/20 pb-6 mb-6"><img src="/CLASH26 PLATFORM HEADER.png" alt="EMEA Clash" width={280} height={64} className="h-16 w-auto object-contain mb-4"/><h1 className="text-2xl font-bold">Tournament tools</h1><p className="text-white/70 mt-2">Tools for teams, referees, and broadcasts.</p></header>
  <ul className="divide-y divide-white/20 border border-white/20 rounded">{services.map(service=><li key={service.title} className="p-5"><a className="text-lg font-semibold underline underline-offset-4" href={service.href}>{service.title}</a><p className="text-white/70 mt-1">{service.description}</p></li>)}</ul>
  <footer className="text-sm text-white/50 mt-8">EMEA Clash</footer>
 </main>;
}
