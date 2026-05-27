import { useParams } from 'react-router-dom';

export default function KdpDetail() {
  const { slug } = useParams();
  return (
    <section>
      <h1>KDP book: {slug}</h1>
      <p>Detail page arrives in Plan B.</p>
    </section>
  );
}
