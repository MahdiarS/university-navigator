"""
First-floor plans of campus buildings 1, 2 and 3, redrawn from the owner's hand-drawn sketches.

Coordinates are metres in each building's own frame: u runs along the long walls (roughly east), v across them
(roughly south), the origin is the corner of the footprint's bounding box (the frame is the footprint rotated by
build_interiors.PHI). Every rectangle is [u0, v0, u1, v1]. Rooms are clipped to the real footprint from the site plan.

The sketches are schematic (not to scale), so what is taken from them is *which room is where*: the shape of the
corridor system, which rooms sit on which side of it, in which order, and where the doors, bridges and stairs are.
Sizes are chosen so everything fits the footprint. Nothing here is a survey.

Sketch -> room numbers (building 1, from the list written beside the sketch):
  1=414 2=413 3=409 4=408 5=407 6=406 7=400 8=401 9=402 10=403 11=404 12=405 13=WC 14=412 15=411 16=410 17=WC
"""

PLANS = {
    # ------------------------------------------------------------------------------------------------------------
    # Building 1 — 36.3 x 13.6 m. Sketch: a stepped corridor. A north-south arm at the west end (rooms 9, 10 on its
    # west side and 11, 12 on its east side; 7 and 8 stacked at the west end), the corridor runs along the bottom, steps up
    # to the main band, a short branch to room 4, the street entrance (arrow) at the bottom, the sky bridge
    # ("پل") rising out of the band at 3/4 of the length with rooms 16 on its west and 15, 14 on its east, and rooms
    # 3, 2, 1 along the east part of the band.
    1: {
        "corridors": [
            [4.2, 1.5, 6.4, 12.3],  # west arm (north-south)
            [6.4, 10.0, 9.2, 12.3],  # low band along the bottom
            [9.2, 8.0, 11.4, 12.3],  # step up to the main band
            [9.2, 8.0, 34.0, 10.2],  # main band
            [15.6, 4.8, 17.4, 8.0],  # branch to room 4
            [21.3, 1.3, 23.5, 8.0],  # bridge corridor, runs out through the north wall
        ],
        "lobby": [14.2, 10.2, 17.8, 13.0],  # stair lobby at the street door
        "rooms": {
            "403": [0.0, 1.5, 4.2, 4.9],
            "402": [0.0, 4.9, 4.2, 8.3],
            "401": [0.0, 8.3, 4.2, 10.5],
            "400": [0.0, 10.5, 4.2, 12.4],
            "404": [6.4, 1.5, 9.6, 5.0],
            "405": [6.4, 5.0, 9.2, 8.0],
            "wc-1": [6.4, 8.0, 9.2, 10.0],
            "406": [9.2, 4.8, 12.4, 8.0],
            "407": [12.4, 4.8, 15.6, 8.0],
            "408": [14.6, 1.3, 18.2, 4.8],
            "409": [17.4, 5.0, 21.3, 8.0],
            "410": [18.4, 1.3, 21.3, 5.0],
            "411": [23.5, 1.3, 26.7, 4.2],
            "412": [23.5, 4.2, 26.7, 8.0],
            "413": [27.0, 5.0, 31.0, 8.0],
            "414": [34.0, 8.0, 36.2, 12.4],
            "wc-2": [11.4, 10.2, 14.2, 12.4],
        },
        "bridge": {"to": "north"},
    },
    # ------------------------------------------------------------------------------------------------------------
    # Building 2 — 46 x 16 m. Sketch: two wings (west, east) with an open hall between them; the sky bridge to
    # building 3 meets the hall at the top and the bridge to building 1 at the bottom. Each wing has rooms
    # on either side of E-W corridors that open onto the hall.
    2: {
        "corridors": [
            [27.2, 0.3, 32.6, 13.8],  # central hall (north-south), both bridges meet it
            [5.0, 3.3, 27.2, 5.3],  # west wing, upper corridor
            [5.0, 5.3, 7.0, 11.6],  # west end, joins the two corridors
            [5.0, 10.1, 27.2, 11.6],  # west wing, lower corridor
            [32.6, 8.0, 46.0, 10.0],  # east wing corridor
        ],
        "rooms": {
            "428": [10.0, 0.3, 18.4, 3.3],
            "429": [18.4, 0.3, 27.2, 3.3],
            "427": [0.2, 4.8, 5.0, 6.8],
            "426": [0.2, 6.8, 5.0, 9.4],
            "417": [0.2, 9.4, 5.0, 12.4],
            "425": [7.0, 5.3, 17.0, 8.1],
            "415": [17.0, 5.3, 27.2, 8.1],
            "418": [7.0, 8.1, 27.2, 10.1],
            "416": [7.0, 11.6, 17.0, 14.1],
            "tool": [17.0, 11.6, 27.2, 14.1],
            "430": [32.6, 0.3, 36.0, 8.0],
            "431": [36.0, 5.1, 39.5, 8.0],
            "421": [39.5, 5.1, 43.0, 8.0],
            "420": [43.0, 5.1, 46.0, 8.0],
            "419": [32.6, 10.0, 35.95, 14.0],
            "422": [35.95, 10.0, 39.3, 15.0],
            "424": [39.3, 10.0, 42.65, 15.0],
            "423": [42.65, 10.0, 46.0, 15.0],
        },
        "bridge": {"to": "both"},
    },
    # ------------------------------------------------------------------------------------------------------------
    # Building 3 — 35.5 x 23.2 m. Sketch: a long corridor (rooms on both sides) that meets a north-south corridor at its east
    # end; the entrance arrow is on the corridor, the sky bridge leaves the north-south corridor at its south end.
    3: {
        "corridors": [
            [2.6, 13.0, 28.4, 15.4],  # long east-west corridor
            [26.0, 5.4, 28.4, 22.5],  # north-south corridor, the bridge leaves at its south end
        ],
        "lobby": [15.8, 9.8, 20.5, 13.0],
        "rooms": {
            "446": [1.6, 7.0, 5.3, 13.0],
            "444": [5.3, 6.0, 9.0, 13.0],
            "442": [9.0, 6.0, 12.7, 13.0],
            "440": [12.7, 8.8, 16.0, 13.0],
            "438": [20.4, 8.8, 23.4, 13.0],
            "447": [1.6, 15.4, 5.6, 22.0],
            "445": [5.6, 15.4, 9.6, 22.0],
            "443": [9.6, 15.4, 13.2, 19.0],
            "441": [13.2, 15.4, 17.2, 19.0],
            "439": [17.2, 15.4, 21.2, 19.0],
            "436": [23.4, 5.4, 26.0, 9.0],
            "437": [23.4, 9.0, 26.0, 12.8],
            "432": [28.4, 5.2, 33.8, 8.8],
            "433": [28.4, 8.8, 33.8, 12.4],
            "434": [28.4, 15.4, 33.8, 18.9],
            "435": [28.4, 19.0, 30.9, 22.7],
        },
        "bridge": {"to": "south"},
    },
}
