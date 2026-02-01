import { Routes, Route } from "react-router-dom";
import Home from "./Pages/Home";
import About from "./Pages/About";
import Login from "./Pages/Login";
import UserDashboard from "./Pages/UserDashboard";
import CompanyDashboard from "./Pages/CompanyDashboard";
import ThirteenWeekForecast from "./Pages/ThirteenWeekForecast";
import Categories from "./Pages/Categories";
import Transactions from "./Pages/Transactions";
import ConnectData from "./Pages/ConnectData";
import Navbar from "./Components/Navbar";
import Sidebar from "./Components/Sidebar";
import Footer from "./Components/Footer";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SidebarProvider } from "./contexts/SidebarContext";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";

const App = () => {
  return (
    <ThemeProvider>
      <SidebarProvider>
        <Navbar />
        <hr className="navbar-divider" />
        <Sidebar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/login" element={<Login />} />
          <Route path="/user-dashboard" element={<UserDashboard />} />
          <Route path="/company-dashboard" element={<CompanyDashboard />} />
          <Route path="/13-week-forecast" element={<ThirteenWeekForecast />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/connect-data" element={<ConnectData />} />
        </Routes>
        <Footer />
        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="light"
        />
      </SidebarProvider>
    </ThemeProvider>
  );
};

export default App;
