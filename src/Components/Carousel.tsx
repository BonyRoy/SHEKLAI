import { useState } from "react";
import "./Carousel.css";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";

const Carousel = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const slides = [
    {
      image: "/Carosoul Images/one.png",
      title: "13-Week Forecast Table",
      description: "Detailed week-by-week breakdown with drill-down capabilities",
    },
    {
      image: "/Carosoul Images/two.png",
      title: "AI-Powered Analytics",
      description: "Intelligent insights and automated categorization for better forecasting",
    },
    {
      image: "/Carosoul Images/three.png",
      title: "Real-Time Data Integration",
      description: "Seamlessly connect with QuickBooks, Plaid, and CSV files",
    },
    {
      image: "/Carosoul Images/four.png",
      title: "Scenario Analysis",
      description: "Compare base, high, and low scenarios for comprehensive planning",
    },
    {
      image: "/Carosoul Images/five.png",
      title: "Visual Cash Flow Dashboard",
      description: "Interactive charts and graphs for intuitive cash flow visualization",
    },
  ];

  const goToPrevious = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex === 0 ? slides.length - 1 : prevIndex - 1
    );
  };

  const goToNext = () => {
    setCurrentIndex((prevIndex) =>
      prevIndex === slides.length - 1 ? 0 : prevIndex + 1
    );
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  return (
    <div className="carousel-container">
      <div className="carousel-header">
        <button className="carousel-action-button">See It In Action</button>
        <h2 className="carousel-main-title">Powerful Features, Simple Interface</h2>
        <p className="carousel-subtitle">
          Navigate through our key features and see how easy forecasting can be
        </p>
      </div>

      <div className="carousel-wrapper">
        <div className="carousel-slide-container">
          <div
            className="carousel-slides"
            style={{ transform: `translateX(-${currentIndex * 100}%)` }}
          >
            {slides.map((slide, index) => (
              <div key={index} className="carousel-slide">
                <img
                  src={slide.image}
                  alt={slide.title}
                  className="carousel-image"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="carousel-navigation">
        <button
          className="carousel-nav-button carousel-nav-prev"
          onClick={goToPrevious}
          aria-label="Previous slide"
        >
          <FiChevronLeft />
        </button>

        <div className="carousel-dots">
          {slides.map((_, index) => (
            <button
              key={index}
              className={`carousel-dot ${index === currentIndex ? "active" : ""}`}
              onClick={() => goToSlide(index)}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>

        <button
          className="carousel-nav-button carousel-nav-next"
          onClick={goToNext}
          aria-label="Next slide"
        >
          <FiChevronRight />
        </button>
      </div>

      <div className="carousel-caption">
        <h3 className="carousel-caption-title">{slides[currentIndex].title}</h3>
        <p className="carousel-caption-description">
          {slides[currentIndex].description}
        </p>
      </div>
    </div>
  );
};

export default Carousel;
