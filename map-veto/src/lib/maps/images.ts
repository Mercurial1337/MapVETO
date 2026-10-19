import type {StaticImageData} from 'next/image';
import Abyss from '../../../public/maps/valorant/Abyss.webp';
import Ascent from '../../../public/maps/valorant/Ascent.webp';
import Bind from '../../../public/maps/valorant/Bind.webp';
import Breeze from '../../../public/maps/valorant/Breeze.webp';
import Corrode from '../../../public/maps/valorant/Corrode.webp';
import Fracture from '../../../public/maps/valorant/Fracture.webp';
import Haven from '../../../public/maps/valorant/Haven.webp';
import Icebox from '../../../public/maps/valorant/Icebox.webp';
import Lotus from '../../../public/maps/valorant/Lotus.webp';
import Pearl from '../../../public/maps/valorant/Pearl.webp';
import Split from '../../../public/maps/valorant/Split.webp';
import Summit from '../../assets/maps/Summit.webp';
import Sunset from '../../../public/maps/valorant/Sunset.webp';

// Static imports get content-hashed URLs and immutable browser/CDN caching.
// Next.js also generates tiny blur previews and responsive thumbnails.
const images:Record<string,StaticImageData>={Abyss,Ascent,Bind,Breeze,Corrode,Fracture,Haven,Icebox,Lotus,Pearl,Split,Summit,Sunset};

export function mapImageSource(name:string,url:string,failed=false):StaticImageData|string {
 const bundled=images[name];
 if(bundled && (failed || !url || url.toLowerCase()===`/maps/valorant/${name}.webp`.toLowerCase()))return bundled;
 return failed || !url ? '/maps/valorant/default.webp' : url;
}
