import { useMediaQuery } from "@mantine/hooks";

export const useMobileDetection = () => {
  const isMobile = useMediaQuery("(max-width: 768px)");
  return isMobile;
};
