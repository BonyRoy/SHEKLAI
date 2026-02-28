import { Routes, Route } from "react-router-dom";
import Home from "./Pages/Home";
import About from "./Pages/About";
import Login from "./Pages/Login";
import UserDashboard from "./Pages/UserDashboard";
import CompanyDashboard from "./Pages/CompanyDashboard";
import Categories from "./Pages/Categories";
import Transactions from "./Pages/Transactions";
import ConnectData from "./Pages/ConnectData";
import ClassificationResults from "./Pages/ClassificationResults";
import CashFlow from "./Pages/CashFlow";
import Navbar from "./Components/Navbar";
import Sidebar from "./Components/Sidebar";
import Footer from "./Components/Footer";
import AgentChat from "./Components/AgentChat";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SidebarProvider } from "./contexts/SidebarContext";
import { AgentChatProvider } from "./contexts/AgentChatContext";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";

const App = () => {
  return (
    <ThemeProvider>
      <SidebarProvider>
        <AgentChatProvider>
          <Navbar />
          <Sidebar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/login" element={<Login />} />
            <Route path="/user-dashboard" element={<UserDashboard />} />
            <Route path="/company-dashboard" element={<CompanyDashboard />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/connect-data" element={<ConnectData />} />
            <Route path="/classification-results" element={<ClassificationResults />} />
            <Route path="/cash-flow" element={<CashFlow />} />
          </Routes>
          <Footer />
          <AgentChat />
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
        </AgentChatProvider>
      </SidebarProvider>
    </ThemeProvider>
  );
};

export default App;
