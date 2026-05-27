import { useParams } from 'react-router-dom';

export default function EtsyDetail() {
  const { listingId } = useParams();
  return (
    <section>
      <h1>Etsy listing: {listingId}</h1>
      <p>Detail page arrives in Plan B.</p>
    </section>
  );
}
