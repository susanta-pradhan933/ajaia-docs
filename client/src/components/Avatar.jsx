export default function Avatar({ user, size = 28 }) {
  const initials = user.name.split(' ').map((p) => p[0]).join('').slice(0, 2);
  return (
    <span className="avatar" style={{ background: user.color, width: size, height: size, fontSize: size * 0.42 }} title={`${user.name} <${user.email}>`}>
      {initials}
    </span>
  );
}
