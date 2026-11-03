import React,{useEffect,useState} from 'react';
import FIELD_MARKETING_IMAGE_TWO from '../assets/marketing/field-venue-advert-2.jpeg';
import FIELD_MARKETING_IMAGE from '../assets/marketing/field-venue-marketing.png';
export default function HubMarketingAdvert({audience='field'}){
  const [secondAdvertReady, setSecondAdvertReady] = useState(false);
  const [advertIndex, setAdvertIndex] = useState(1);

  useEffect(() => {
    let active = true;
    const preload = new Image();
    preload.onload = () => {
      if (active) setSecondAdvertReady(true);
    };
    preload.src = FIELD_MARKETING_IMAGE_TWO;
    return () => {
      active = false;
      preload.onload = null;
    };
  }, []);

 return <section className={`fanm-advert-row fanm-marketing-split ${audience==='club'?'fanm-club-advert':''}`}>
<div
        className="fanm-venues__closing-visual field-marketing-carousel"
        aria-label="5 Asides Near Me Field experience"
      >
        <img
          src={
            advertIndex === 1
              ? FIELD_MARKETING_IMAGE_TWO
              : FIELD_MARKETING_IMAGE
          }
          onError={() => {
            setSecondAdvertReady(false);
            setAdvertIndex(0);
          }}
          alt={
            advertIndex === 1
              ? "5 Asides Near Me Field football experience"
              : "5 Asides Near Me Field and league experience"
          }
        />

        {secondAdvertReady && (
          <>
            <button
              type="button"
              className="field-marketing-carousel__arrow field-marketing-carousel__arrow--previous"
              aria-label="Show previous marketing image"
              onClick={() =>
                setAdvertIndex((index) =>
                  index === 0 ? 1 : 0
                )
              }
            >
              ‹
            </button>

            <button
              type="button"
              className="field-marketing-carousel__arrow field-marketing-carousel__arrow--next"
              aria-label="Show next marketing image"
              onClick={() =>
                setAdvertIndex((index) =>
                  index === 0 ? 1 : 0
                )
              }
            >
              ›
            </button>

            <div
              className="field-marketing-carousel__dots"
              aria-label={`Marketing image ${advertIndex + 1} of 2`}
            >
              {[0, 1].map((index) => (
                <button
                  key={index}
                  type="button"
                  className={
                    index === advertIndex
                      ? "field-marketing-carousel__dot is-active"
                      : "field-marketing-carousel__dot"
                  }
                  aria-label={`Show marketing image ${index + 1}`}
                  aria-current={
                    index === advertIndex
                      ? "true"
                      : undefined
                  }
                  onClick={() => setAdvertIndex(index)}
                />
              ))}
            </div>
          </>
        )}
      </div>
 <div className="fanm-advert-copy"><span className="hub-kicker">{audience==='club'?'FOOTBALL FOR YOUR PEOPLE':'YOUR FIELD. YOUR COMMUNITY.'}</span><h3>{audience==='club'?'Bring your people to the game.':'Make every matchday count.'}</h3><p>{audience==='club'?'Build your Community Club, or request a Company Club supported by FANM. Bring players together for football, fitness and shared moments.':'Welcome clubs, organise leagues and keep players informed. FANM connects your Field’s football community in one place.'}</p></div>
 </section>;
}
