import arrowLeft from "../assets/icons/arrow-left.svg";
import arrowRight from "../assets/icons/arrow-right.svg";
import bell from "../assets/icons/bell.svg";
import bellRinging from "../assets/icons/bell-ringing.svg";
import check from "../assets/icons/check.svg";
import gear from "../assets/icons/gear.svg";
import listBullets from "../assets/icons/list-bullets.svg";
import listBulletsFill from "../assets/icons/list-bullets-fill.svg";
import magnifyingGlass from "../assets/icons/magnifying-glass.svg";
import mapTrifold from "../assets/icons/map-trifold.svg";
import mapTrifoldFill from "../assets/icons/map-trifold-fill.svg";
import shareFat from "../assets/icons/share-fat.svg";
import star from "../assets/icons/star.svg";
import starFill from "../assets/icons/star-fill.svg";
import thumbsDown from "../assets/icons/thumbs-down.svg";
import thumbsDownFill from "../assets/icons/thumbs-down-fill.svg";
import thumbsUp from "../assets/icons/thumbs-up.svg";
import thumbsUpFill from "../assets/icons/thumbs-up-fill.svg";
import user from "../assets/icons/user.svg";
import userFill from "../assets/icons/user-fill.svg";
import userCirclePlus from "../assets/icons/user-circle-plus.svg";
import warning from "../assets/icons/warning.svg";

const ICONS = Object.freeze({
  "arrow-left": arrowLeft, "arrow-right": arrowRight,
  bell, "bell-ringing": bellRinging, check, gear,
  "list-bullets": listBullets, "list-bullets-fill": listBulletsFill,
  "magnifying-glass": magnifyingGlass,
  "map-trifold": mapTrifold, "map-trifold-fill": mapTrifoldFill,
  "share-fat": shareFat, star, "star-fill": starFill,
  "thumbs-down": thumbsDown, "thumbs-down-fill": thumbsDownFill,
  "thumbs-up": thumbsUp, "thumbs-up-fill": thumbsUpFill,
  user, "user-fill": userFill, "user-circle-plus": userCirclePlus, warning,
});

export default function AppIcon({ name, className = "", alt = "" }) {
  const src = ICONS[name];
  if (!src) return null;
  return <img className={`app-icon${className ? ` ${className}` : ""}`} src={src} alt={alt} aria-hidden={alt ? undefined : true} />;
}
