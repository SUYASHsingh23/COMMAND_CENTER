import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class RTCSessionDescription:
    sdp: str
    type: str


@dataclass
class ICECandidate:
    candidate: str
    sdp_mid: str | None = None
    sdp_m_line_index: int | None = None


@dataclass
class WebRTCSignalingSession:
    session_id: str
    offer: RTCSessionDescription | None = None
    answer: RTCSessionDescription | None = None
    ice_candidates: list[ICECandidate] = field(default_factory=list)


_sessions: dict[str, WebRTCSignalingSession] = {}


def get_or_create_signaling_session(session_id: str) -> WebRTCSignalingSession:
    if session_id not in _sessions:
        _sessions[session_id] = WebRTCSignalingSession(session_id=session_id)
    return _sessions[session_id]


def store_offer(session_id: str, sdp: str, sdp_type: str) -> WebRTCSignalingSession:
    sig = get_or_create_signaling_session(session_id)
    sig.offer = RTCSessionDescription(sdp=sdp, type=sdp_type)
    logger.info("WebRTC offer stored for session %s", session_id)
    return sig


def store_answer(session_id: str, sdp: str, sdp_type: str) -> WebRTCSignalingSession:
    sig = get_or_create_signaling_session(session_id)
    sig.answer = RTCSessionDescription(sdp=sdp, type=sdp_type)
    logger.info("WebRTC answer stored for session %s", session_id)
    return sig


def add_ice_candidate(session_id: str, candidate: str, sdp_mid: str | None, sdp_m_line_index: int | None):
    sig = get_or_create_signaling_session(session_id)
    sig.ice_candidates.append(ICECandidate(
        candidate=candidate,
        sdp_mid=sdp_mid,
        sdp_m_line_index=sdp_m_line_index,
    ))


def get_signaling_session(session_id: str) -> WebRTCSignalingSession | None:
    return _sessions.get(session_id)


def remove_signaling_session(session_id: str):
    _sessions.pop(session_id, None)
