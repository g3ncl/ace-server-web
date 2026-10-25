export type Track = {
  track: string;
  layout: string;
  event_name: string;
  track_length: number | string;
  max_pit_slot?: number;
};
export type Car = {
  name: string;
  display_name: string;
  performance_indicator: number;
};
export type Catalog = { cars: Car[]; practice: Track[]; race: Track[] };
export type Time = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  time_multiplier: number;
};
export type Config = {
  version: number;
  runtime: { registerLobby: boolean; carSelection?: "all" | "selected" };
  server: {
    server_name: string;
    server_tcp_listener_port: number;
    server_udp_listener_port: number;
    server_tcp_internal_port: number;
    server_udp_internal_port: number;
    server_http_port: number;
    max_players: number;
    cycle: boolean;
    type: string;
    tuning_type: string;
    driver_password: string;
    spectator_password: string;
    admin_password: string;
    allowed_cars_list_full: {
      car_name: string;
      ballast: number;
      restrictor: number;
    }[];
    entry_list_server_url?: string;
    results_post_url?: string;
  };
  event: {
    game_type: string;
    event: Track;
    weather_type: string;
    weather_behaviour: string;
    initial_grip: string;
    export_json: boolean;
    game_config: Record<string, number | string | boolean | Time>;
  };
};
export type Status = {
  state: string;
  pid: number | null;
  startedAt: string | null;
  lastExit: {
    code?: number;
    signal?: string;
    error?: string;
    at: string;
  } | null;
  pendingChanges: boolean;
  serverName: string;
  track: Track;
  ports: { game: number; tcp: number; udp: number; http: number };
  registerLobby: boolean;
  installed: boolean;
};
