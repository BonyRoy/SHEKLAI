import "./FullPageLoader.css";

interface FullPageLoaderProps {
  isLoading: boolean;
}

const FullPageLoader = ({ isLoading }: FullPageLoaderProps) => {
  if (!isLoading) return null;

  return (
    <div className="full-page-loader-overlay">
      <div className="full-page-loader-container">
        <div className="full-page-loader-spinner"></div>
        <p className="full-page-loader-text">Loading...</p>
      </div>
    </div>
  );
};

export default FullPageLoader;
